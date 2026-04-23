use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::http::{Request, header::SEC_WEBSOCKET_PROTOCOL};
use futures_util::{SinkExt, StreamExt};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use tokio::sync::{Mutex, mpsc};
use tokio::time::timeout;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::models::{
    MqttPublishReq, MqttSessionConnectReq, MqttSubscriptionReq, ProtocolConnectionState,
    ProtocolLogEntry, ProtocolLogKind, ProtocolSessionSnapshot, WebSocketSendFrameReq,
    WebSocketSessionConnectReq,
};

const LOG_LIMIT: usize = 200;

#[derive(Clone, Default)]
pub struct ProtocolRuntime {
    websocket_sessions: Arc<Mutex<HashMap<String, Arc<WebSocketSessionSlot>>>>,
    mqtt_sessions: Arc<Mutex<HashMap<String, Arc<MqttSessionSlot>>>>,
}

impl ProtocolRuntime {
    pub async fn connect_websocket(
        &self,
        req: WebSocketSessionConnectReq,
    ) -> Result<ProtocolSessionSnapshot, String> {
        let session = self.websocket_slot(&req.session_id).await;
        let (generation, previous_tx) = session.begin_connect().await;
        if let Some(tx) = previous_tx {
            let _ = tx.send(WebSocketCommand::Disconnect);
        }

        session
            .push_log(
                generation,
                ProtocolLogKind::System,
                format!("Connecting to {}", websocket_endpoint(&req)),
            )
            .await;

        let (command_tx, command_rx) = mpsc::unbounded_channel();
        session.set_command(generation, command_tx).await;

        tokio::spawn(run_websocket_session(req.clone(), session.clone(), generation, command_rx));

        Ok(session.snapshot(&req.session_id).await)
    }

    pub async fn disconnect_websocket(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.websocket_slot(session_id).await;
        let previous_tx = session.disconnect("Disconnected").await;
        if let Some(tx) = previous_tx {
            let _ = tx.send(WebSocketCommand::Disconnect);
        }
        session.snapshot(session_id).await
    }

    pub async fn get_websocket_session(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.websocket_slot(session_id).await;
        session.snapshot(session_id).await
    }

    pub async fn send_websocket_frame(
        &self,
        session_id: &str,
        req: WebSocketSendFrameReq,
    ) -> Result<ProtocolSessionSnapshot, String> {
        let session = self.websocket_slot(session_id).await;
        session
            .send(WebSocketCommand::Send(req.message))
            .await?;
        Ok(session.snapshot(session_id).await)
    }

    pub async fn clear_websocket_logs(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.websocket_slot(session_id).await;
        session.clear_logs().await;
        session.snapshot(session_id).await
    }

    pub async fn connect_mqtt(
        &self,
        req: MqttSessionConnectReq,
    ) -> Result<ProtocolSessionSnapshot, String> {
        let session = self.mqtt_slot(&req.session_id).await;
        let (generation, previous_tx) = session.begin_connect().await;
        if let Some(tx) = previous_tx {
            let _ = tx.send(MqttCommand::Disconnect);
        }

        session
            .push_log(
                generation,
                ProtocolLogKind::System,
                format!("Connecting to {}", mqtt_endpoint(&req)),
            )
            .await;

        let (command_tx, command_rx) = mpsc::unbounded_channel();
        session.set_command(generation, command_tx).await;

        tokio::spawn(run_mqtt_session(req.clone(), session.clone(), generation, command_rx));

        Ok(session.snapshot(&req.session_id).await)
    }

    pub async fn disconnect_mqtt(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.mqtt_slot(session_id).await;
        let previous_tx = session.disconnect("Disconnected").await;
        if let Some(tx) = previous_tx {
            let _ = tx.send(MqttCommand::Disconnect);
        }
        session.snapshot(session_id).await
    }

    pub async fn get_mqtt_session(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.mqtt_slot(session_id).await;
        session.snapshot(session_id).await
    }

    pub async fn publish_mqtt(
        &self,
        session_id: &str,
        req: MqttPublishReq,
    ) -> Result<ProtocolSessionSnapshot, String> {
        let session = self.mqtt_slot(session_id).await;
        session.send(MqttCommand::Publish(req)).await?;
        Ok(session.snapshot(session_id).await)
    }

    pub async fn sync_mqtt_subscriptions(
        &self,
        session_id: &str,
        subscriptions: Vec<MqttSubscriptionReq>,
    ) -> Result<ProtocolSessionSnapshot, String> {
        let session = self.mqtt_slot(session_id).await;
        session
            .send(MqttCommand::SyncSubscriptions(subscriptions))
            .await?;
        Ok(session.snapshot(session_id).await)
    }

    pub async fn clear_mqtt_logs(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let session = self.mqtt_slot(session_id).await;
        session.clear_logs().await;
        session.snapshot(session_id).await
    }

    async fn websocket_slot(&self, session_id: &str) -> Arc<WebSocketSessionSlot> {
        let mut sessions = self.websocket_sessions.lock().await;
        sessions
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(WebSocketSessionSlot::default()))
            .clone()
    }

    async fn mqtt_slot(&self, session_id: &str) -> Arc<MqttSessionSlot> {
        let mut sessions = self.mqtt_sessions.lock().await;
        sessions
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(MqttSessionSlot::default()))
            .clone()
    }
}

#[derive(Debug)]
enum WebSocketCommand {
    Send(String),
    Disconnect,
}

#[derive(Debug)]
enum MqttCommand {
    Publish(MqttPublishReq),
    SyncSubscriptions(Vec<MqttSubscriptionReq>),
    Disconnect,
}

#[derive(Default)]
struct WebSocketSessionSlot {
    state: Mutex<WebSocketSessionState>,
}

struct WebSocketSessionState {
    generation: u64,
    connection_state: ProtocolConnectionState,
    logs: Vec<ProtocolLogEntry>,
    command_tx: Option<mpsc::UnboundedSender<WebSocketCommand>>,
}

impl Default for WebSocketSessionState {
    fn default() -> Self {
        Self {
            generation: 0,
            connection_state: ProtocolConnectionState::Idle,
            logs: Vec::new(),
            command_tx: None,
        }
    }
}

impl WebSocketSessionSlot {
    async fn begin_connect(&self) -> (u64, Option<mpsc::UnboundedSender<WebSocketCommand>>) {
        let mut state = self.state.lock().await;
        state.generation += 1;
        state.connection_state = ProtocolConnectionState::Connecting;
        (state.generation, state.command_tx.take())
    }

    async fn set_command(&self, generation: u64, command_tx: mpsc::UnboundedSender<WebSocketCommand>) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.command_tx = Some(command_tx);
        }
    }

    async fn push_log(&self, generation: u64, kind: ProtocolLogKind, message: String) {
        let mut state = self.state.lock().await;
        if state.generation != generation {
            return;
        }
        state.logs.push(build_log(kind, message));
        trim_logs(&mut state.logs);
    }

    async fn set_connection_state(&self, generation: u64, connection_state: ProtocolConnectionState) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.connection_state = connection_state;
        }
    }

    async fn finish(&self, generation: u64, connection_state: ProtocolConnectionState) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.connection_state = connection_state;
            state.command_tx = None;
        }
    }

    async fn disconnect(&self, message: &str) -> Option<mpsc::UnboundedSender<WebSocketCommand>> {
        let mut state = self.state.lock().await;
        state.generation += 1;
        state.connection_state = ProtocolConnectionState::Idle;
        state.logs.push(build_log(ProtocolLogKind::System, message.to_string()));
        trim_logs(&mut state.logs);
        state.command_tx.take()
    }

    async fn send(&self, command: WebSocketCommand) -> Result<(), String> {
        let state = self.state.lock().await;
        let tx = state
            .command_tx
            .as_ref()
            .ok_or_else(|| "WebSocket session is not active".to_string())?;
        tx.send(command)
            .map_err(|_| "WebSocket session is no longer available".to_string())
    }

    async fn snapshot(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let state = self.state.lock().await;
        ProtocolSessionSnapshot {
            session_id: session_id.to_string(),
            connection_state: state.connection_state,
            logs: state.logs.clone(),
        }
    }

    async fn clear_logs(&self) {
        let mut state = self.state.lock().await;
        state.logs.clear();
    }
}

#[derive(Default)]
struct MqttSessionSlot {
    state: Mutex<MqttSessionState>,
}

struct MqttSessionState {
    generation: u64,
    connection_state: ProtocolConnectionState,
    logs: Vec<ProtocolLogEntry>,
    command_tx: Option<mpsc::UnboundedSender<MqttCommand>>,
}

impl Default for MqttSessionState {
    fn default() -> Self {
        Self {
            generation: 0,
            connection_state: ProtocolConnectionState::Idle,
            logs: Vec::new(),
            command_tx: None,
        }
    }
}

impl MqttSessionSlot {
    async fn begin_connect(&self) -> (u64, Option<mpsc::UnboundedSender<MqttCommand>>) {
        let mut state = self.state.lock().await;
        state.generation += 1;
        state.connection_state = ProtocolConnectionState::Connecting;
        (state.generation, state.command_tx.take())
    }

    async fn set_command(&self, generation: u64, command_tx: mpsc::UnboundedSender<MqttCommand>) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.command_tx = Some(command_tx);
        }
    }

    async fn push_log(&self, generation: u64, kind: ProtocolLogKind, message: String) {
        let mut state = self.state.lock().await;
        if state.generation != generation {
            return;
        }
        state.logs.push(build_log(kind, message));
        trim_logs(&mut state.logs);
    }

    async fn set_connection_state(&self, generation: u64, connection_state: ProtocolConnectionState) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.connection_state = connection_state;
        }
    }

    async fn finish(&self, generation: u64, connection_state: ProtocolConnectionState) {
        let mut state = self.state.lock().await;
        if state.generation == generation {
            state.connection_state = connection_state;
            state.command_tx = None;
        }
    }

    async fn disconnect(&self, message: &str) -> Option<mpsc::UnboundedSender<MqttCommand>> {
        let mut state = self.state.lock().await;
        state.generation += 1;
        state.connection_state = ProtocolConnectionState::Idle;
        state.logs.push(build_log(ProtocolLogKind::System, message.to_string()));
        trim_logs(&mut state.logs);
        state.command_tx.take()
    }

    async fn send(&self, command: MqttCommand) -> Result<(), String> {
        let state = self.state.lock().await;
        let tx = state
            .command_tx
            .as_ref()
            .ok_or_else(|| "MQTT session is not active".to_string())?;
        tx.send(command)
            .map_err(|_| "MQTT session is no longer available".to_string())
    }

    async fn snapshot(&self, session_id: &str) -> ProtocolSessionSnapshot {
        let state = self.state.lock().await;
        ProtocolSessionSnapshot {
            session_id: session_id.to_string(),
            connection_state: state.connection_state,
            logs: state.logs.clone(),
        }
    }

    async fn clear_logs(&self) {
        let mut state = self.state.lock().await;
        state.logs.clear();
    }
}

#[allow(clippy::too_many_lines)]
async fn run_websocket_session(
    req: WebSocketSessionConnectReq,
    session: Arc<WebSocketSessionSlot>,
    generation: u64,
    mut command_rx: mpsc::UnboundedReceiver<WebSocketCommand>,
) {
    loop {
        let endpoint = websocket_endpoint(&req);
        let connect_result = timeout(
            Duration::from_millis(req.connect_timeout_ms.max(1)),
            websocket_connect(&req),
        )
        .await;

        let (socket, _) = match connect_result {
            Ok(Ok(socket)) => socket,
            Ok(Err(error)) => {
                session
                    .push_log(generation, ProtocolLogKind::System, format!("Connection error: {error}"))
                    .await;

                if !req.auto_reconnect {
                    session.finish(generation, ProtocolConnectionState::Idle).await;
                    return;
                }

                session
                    .push_log(
                        generation,
                        ProtocolLogKind::System,
                        format!("Disconnected, retrying in {}ms", req.reconnect_period_ms.max(1)),
                    )
                    .await;
                session
                    .set_connection_state(generation, ProtocolConnectionState::Connecting)
                    .await;
                tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                continue;
            }
            Err(_) => {
                session
                    .push_log(
                        generation,
                        ProtocolLogKind::System,
                        format!("Connection timed out after {}ms", req.connect_timeout_ms.max(1)),
                    )
                    .await;
                if !req.auto_reconnect {
                    session.finish(generation, ProtocolConnectionState::Idle).await;
                    return;
                }
                session
                    .set_connection_state(generation, ProtocolConnectionState::Connecting)
                    .await;
                tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                continue;
            }
        };

        session
            .set_connection_state(generation, ProtocolConnectionState::Connected)
            .await;
        session
            .push_log(generation, ProtocolLogKind::System, format!("Connected to {endpoint}"))
            .await;

        let (mut writer, mut reader) = socket.split();
        loop {
            tokio::select! {
                maybe_message = reader.next() => {
                    match maybe_message {
                        Some(Ok(message)) => {
                            match message {
                                Message::Text(text) => {
                                    session.push_log(generation, ProtocolLogKind::In, text.to_string()).await;
                                }
                                Message::Binary(binary) => {
                                    session.push_log(
                                        generation,
                                        ProtocolLogKind::In,
                                        format!("[binary {} bytes]", binary.len()),
                                    ).await;
                                }
                                Message::Close(frame) => {
                                    let message = frame.map_or_else(|| "Disconnected".to_string(), |frame| format!("Disconnected ({})", frame.code));
                                    session.push_log(generation, ProtocolLogKind::System, message).await;
                                    if req.auto_reconnect {
                                        session
                                            .set_connection_state(generation, ProtocolConnectionState::Connecting)
                                            .await;
                                        session
                                            .push_log(
                                                generation,
                                                ProtocolLogKind::System,
                                                format!("Disconnected, retrying in {}ms", req.reconnect_period_ms.max(1)),
                                            )
                                            .await;
                                        tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                                        break;
                                    }

                                    session.finish(generation, ProtocolConnectionState::Idle).await;
                                    return;
                                }
                                _ => {}
                            }
                        }
                        Some(Err(error)) => {
                            session.push_log(generation, ProtocolLogKind::System, format!("Connection error: {error}")) .await;
                            if req.auto_reconnect {
                                session
                                    .set_connection_state(generation, ProtocolConnectionState::Connecting)
                                    .await;
                                session
                                    .push_log(
                                        generation,
                                        ProtocolLogKind::System,
                                        format!("Disconnected, retrying in {}ms", req.reconnect_period_ms.max(1)),
                                    )
                                    .await;
                                tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                                break;
                            }

                            session.finish(generation, ProtocolConnectionState::Idle).await;
                            return;
                        }
                        None => {
                            session.push_log(generation, ProtocolLogKind::System, "Disconnected".to_string()).await;
                            if req.auto_reconnect {
                                session
                                    .set_connection_state(generation, ProtocolConnectionState::Connecting)
                                    .await;
                                session
                                    .push_log(
                                        generation,
                                        ProtocolLogKind::System,
                                        format!("Disconnected, retrying in {}ms", req.reconnect_period_ms.max(1)),
                                    )
                                    .await;
                                tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                                break;
                            }

                            session.finish(generation, ProtocolConnectionState::Idle).await;
                            return;
                        }
                    }
                }
                maybe_command = command_rx.recv() => {
                    match maybe_command {
                        Some(WebSocketCommand::Send(message)) => {
                            if let Err(error) = writer.send(Message::Text(message.clone().into())).await {
                                session.push_log(generation, ProtocolLogKind::System, format!("Send failed: {error}")) .await;
                            } else {
                                session.push_log(generation, ProtocolLogKind::Out, message).await;
                            }
                        }
                        Some(WebSocketCommand::Disconnect) | None => {
                            let _ = writer.send(Message::Close(None)).await;
                            session.finish(generation, ProtocolConnectionState::Idle).await;
                            return;
                        }
                    }
                }
            }
        }
    }
}

async fn websocket_connect(
    req: &WebSocketSessionConnectReq,
) -> Result<
    (
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        tokio_tungstenite::tungstenite::handshake::client::Response,
    ),
    String,
> {
    let endpoint = websocket_endpoint(req);
    if req.protocols.trim().is_empty() {
        return connect_async(endpoint.as_str())
            .await
            .map_err(|error| error.to_string());
    }

    let request = Request::builder()
        .uri(endpoint.as_str())
        .header(
            SEC_WEBSOCKET_PROTOCOL,
            req.protocols
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
                .join(", "),
        )
        .body(())
        .map_err(|error| error.to_string())?;

    connect_async(request)
        .await
        .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_lines)]
async fn run_mqtt_session(
    req: MqttSessionConnectReq,
    session: Arc<MqttSessionSlot>,
    generation: u64,
    mut command_rx: mpsc::UnboundedReceiver<MqttCommand>,
) {
    let mut desired_subscriptions = req.subscriptions.clone();

    loop {
        let mqtt_options = match build_mqtt_options(&req) {
            Ok(options) => options,
            Err(error) => {
                session
                    .push_log(generation, ProtocolLogKind::System, format!("Connection error: {error}"))
                    .await;
                session.finish(generation, ProtocolConnectionState::Idle).await;
                return;
            }
        };

        let (client, mut eventloop) = AsyncClient::new(mqtt_options, 32);
        let mut current_subscriptions = HashMap::<String, u8>::new();
        let mut connected = false;
        let connect_timeout = tokio::time::sleep(Duration::from_secs(req.connect_timeout_seconds.max(1)));
        tokio::pin!(connect_timeout);

        loop {
            tokio::select! {
                () = &mut connect_timeout, if !connected => {
                    session.push_log(
                        generation,
                        ProtocolLogKind::System,
                        format!("Connection timed out after {}s", req.connect_timeout_seconds.max(1)),
                    ).await;

                    if req.auto_reconnect {
                        session.set_connection_state(generation, ProtocolConnectionState::Connecting).await;
                        tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                        break;
                    }

                    session.finish(generation, ProtocolConnectionState::Idle).await;
                    return;
                }
                maybe_command = command_rx.recv() => {
                    match maybe_command {
                        Some(MqttCommand::Publish(command)) => {
                            if command.topic.trim().is_empty() {
                                session.push_log(generation, ProtocolLogKind::System, "Publish failed: topic is required".to_string()).await;
                                continue;
                            }

                            let qos = qos_from_u8(command.qos);
                            match client.publish(command.topic.clone(), qos, command.retain, command.payload.clone()).await {
                                Ok(()) => {
                                    session.push_log(
                                        generation,
                                        ProtocolLogKind::Out,
                                        format!("{}: {}", command.topic, command.payload),
                                    ).await;
                                }
                                Err(error) => {
                                    session.push_log(generation, ProtocolLogKind::System, format!("Publish failed: {error}")) .await;
                                }
                            }
                        }
                        Some(MqttCommand::SyncSubscriptions(subscriptions)) => {
                            desired_subscriptions = subscriptions;
                            if connected {
                                sync_subscriptions(&client, &session, generation, &mut current_subscriptions, &desired_subscriptions).await;
                            }
                        }
                        Some(MqttCommand::Disconnect) | None => {
                            let _ = client.disconnect().await;
                            session.finish(generation, ProtocolConnectionState::Idle).await;
                            return;
                        }
                    }
                }
                notification = eventloop.poll() => {
                    match notification {
                        Ok(Event::Incoming(Packet::ConnAck(_))) => {
                            connected = true;
                            session.set_connection_state(generation, ProtocolConnectionState::Connected).await;
                            session.push_log(generation, ProtocolLogKind::System, format!("Connected to {}", mqtt_endpoint(&req))).await;
                            sync_subscriptions(&client, &session, generation, &mut current_subscriptions, &desired_subscriptions).await;
                        }
                        Ok(Event::Incoming(Packet::Publish(publish))) => {
                            let payload = String::from_utf8_lossy(&publish.payload);
                            session.push_log(
                                generation,
                                ProtocolLogKind::In,
                                format!("{}: {}", publish.topic, payload),
                            ).await;
                        }
                        Ok(_) => {}
                        Err(error) => {
                            session.push_log(generation, ProtocolLogKind::System, format!("Connection error: {error}")) .await;
                            if req.auto_reconnect {
                                session.set_connection_state(generation, ProtocolConnectionState::Connecting).await;
                                tokio::time::sleep(Duration::from_millis(req.reconnect_period_ms.max(1))).await;
                                break;
                            }
                            session.finish(generation, ProtocolConnectionState::Idle).await;
                            return;
                        }
                    }
                }
            }
        }
    }
}

async fn sync_subscriptions(
    client: &AsyncClient,
    session: &MqttSessionSlot,
    generation: u64,
    current_subscriptions: &mut HashMap<String, u8>,
    desired_subscriptions: &[MqttSubscriptionReq],
) {
    let desired_map = desired_subscriptions
        .iter()
        .filter(|subscription| subscription.enabled && !subscription.topic.trim().is_empty())
        .map(|subscription| (subscription.topic.trim().to_string(), subscription.qos))
        .collect::<HashMap<_, _>>();

    let previous_topics = current_subscriptions.keys().cloned().collect::<Vec<_>>();
    for topic in previous_topics {
        if desired_map.contains_key(&topic) {
            continue;
        }

        if let Err(error) = client.unsubscribe(topic.clone()).await {
            session.push_log(generation, ProtocolLogKind::System, format!("Unsubscribe failed for {topic}: {error}")) .await;
            continue;
        }

        current_subscriptions.remove(&topic);
        session.push_log(generation, ProtocolLogKind::System, format!("Unsubscribed from {topic}")) .await;
    }

    for (topic, qos) in desired_map {
        let qos_value = qos_from_u8(qos);
        let should_resubscribe = current_subscriptions
            .get(&topic)
            .is_none_or(|current_qos| *current_qos != qos);

        if !should_resubscribe {
            continue;
        }

        if let Err(error) = client.subscribe(topic.clone(), qos_value).await {
            session.push_log(generation, ProtocolLogKind::System, format!("Subscribe failed for {topic}: {error}")) .await;
            continue;
        }

        current_subscriptions.insert(topic.clone(), qos);
        session.push_log(generation, ProtocolLogKind::System, format!("Subscribed to {topic} (QoS {qos})")) .await;
    }
}

fn build_mqtt_options(req: &MqttSessionConnectReq) -> Result<MqttOptions, String> {
    let mut mqtt_options = MqttOptions::parse_url(mqtt_endpoint(req)).map_err(|error| error.to_string())?;

    if !req.client_id.trim().is_empty() {
        mqtt_options.set_client_id(req.client_id.clone());
    } else if !req.clean_start {
        return Err("Client ID is required when clean start is disabled".to_string());
    }

    mqtt_options.set_keep_alive(Duration::from_secs(req.keep_alive_seconds.max(1)));
    mqtt_options.set_clean_session(req.clean_start);

    if !req.username.trim().is_empty() {
        mqtt_options.set_credentials(req.username.clone(), req.password.clone());
    }

    Ok(mqtt_options)
}

fn websocket_endpoint(req: &WebSocketSessionConnectReq) -> String {
    let path = normalize_path(&req.path);
    format!("{}://{}:{}{}", req.scheme, req.host.trim(), req.port, path)
}

fn mqtt_endpoint(req: &MqttSessionConnectReq) -> String {
    let base = format!("{}://{}:{}", req.scheme, req.host.trim(), req.port);
    if req.scheme == "ws" || req.scheme == "wss" {
        format!("{base}{}", normalize_path(&req.path))
    } else {
        base
    }
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        "/".to_string()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn qos_from_u8(qos: u8) -> QoS {
    match qos {
        1 => QoS::AtLeastOnce,
        2 => QoS::ExactlyOnce,
        _ => QoS::AtMostOnce,
    }
}

fn build_log(kind: ProtocolLogKind, message: String) -> ProtocolLogEntry {
    ProtocolLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        kind,
        message,
    }
}

fn trim_logs(logs: &mut Vec<ProtocolLogEntry>) {
    if logs.len() > LOG_LIMIT {
        let drain_count = logs.len() - LOG_LIMIT;
        logs.drain(0..drain_count);
    }
}

#[cfg(test)]
mod tests {
    use super::{mqtt_endpoint, normalize_path, websocket_endpoint};
    use crate::models::{MqttSessionConnectReq, WebSocketSessionConnectReq};

    #[test]
    fn websocket_endpoint_normalizes_paths() {
        let request = WebSocketSessionConnectReq {
            session_id: "ws-1".into(),
            scheme: "wss".into(),
            host: "socket.example.com".into(),
            port: 9443,
            path: "gateway".into(),
            protocols: String::new(),
            connect_timeout_ms: 5_000,
            auto_reconnect: false,
            reconnect_period_ms: 3_000,
        };

        assert_eq!(websocket_endpoint(&request), "wss://socket.example.com:9443/gateway");
        assert_eq!(normalize_path("mqtt"), "/mqtt");
    }

    #[test]
    fn mqtt_endpoint_omits_path_for_raw_transport() {
        let raw_request = MqttSessionConnectReq {
            session_id: "mqtt-1".into(),
            scheme: "mqtts".into(),
            host: "broker.example.com".into(),
            port: 8883,
            path: "/mqtt".into(),
            username: String::new(),
            password: String::new(),
            client_id: "client-1".into(),
            mqtt_version: "5.0".into(),
            connect_timeout_seconds: 10,
            keep_alive_seconds: 60,
            auto_reconnect: false,
            reconnect_period_ms: 4_000,
            clean_start: true,
            subscriptions: Vec::new(),
        };

        let ws_request = MqttSessionConnectReq {
            scheme: "wss".into(),
            ..raw_request.clone()
        };

        assert_eq!(mqtt_endpoint(&raw_request), "mqtts://broker.example.com:8883");
        assert_eq!(mqtt_endpoint(&ws_request), "wss://broker.example.com:8883/mqtt");
    }
}