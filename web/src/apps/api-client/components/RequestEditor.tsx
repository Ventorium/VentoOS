import RequestTabs from './RequestTabs'
import ResponseViewer from './ResponseViewer'
import UrlBar from './UrlBar'

export default function RequestEditor() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <UrlBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <RequestTabs />
        <ResponseViewer />
      </div>
    </div>
  )
}
