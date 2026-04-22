import { describe, expect, it } from 'vitest'
import { parseCurl, toCurl } from '../curl'

describe('curl utils', () => {
  describe('parseCurl', () => {
    it('parses a simple GET curl', () => {
      const parsed = parseCurl("curl 'https://example.com/api/users'")
      expect(parsed).not.toBeNull()
      expect(parsed!.url).toBe('https://example.com/api/users')
      expect(parsed!.method).toBe('GET')
      expect(parsed!.headers).toEqual([])
    })

    it('parses POST with JSON body', () => {
      const parsed = parseCurl(
        `curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{"name":"John"}'`
      )
      expect(parsed!.method).toBe('POST')
      expect(parsed!.url).toBe('https://api.example.com/users')
      expect(parsed!.headers).toContainEqual({ key: 'Content-Type', value: 'application/json', enabled: true })
      expect(parsed!.body).toEqual({ type: 'json', content: '{"name":"John"}' })
    })

    it('parses --json shorthand', () => {
      const parsed = parseCurl(`curl --json '{"foo":"bar"}' 'https://api.example.com/test'`)
      expect(parsed!.method).toBe('POST')
      expect(parsed!.body).toEqual({ type: 'json', content: '{"foo":"bar"}' })
      expect(parsed!.headers).toContainEqual({ key: 'Content-Type', value: 'application/json', enabled: true })
    })

    it('parses multiple headers', () => {
      const parsed = parseCurl(
        `curl -H 'Authorization: Bearer token123' -H 'X-Custom: value' 'https://example.com'`
      )
      expect(parsed!.headers).toHaveLength(2)
      expect(parsed!.headers[0]).toEqual({ key: 'Authorization', value: 'Bearer token123', enabled: true })
      expect(parsed!.headers[1]).toEqual({ key: 'X-Custom', value: 'value', enabled: true })
    })

    it('parses basic auth', () => {
      const parsed = parseCurl(`curl -u 'admin:secret' 'https://example.com'`)
      expect(parsed!.auth).toEqual({ type: 'basic', username: 'admin', password: 'secret' })
    })

    it('parses form data', () => {
      const parsed = parseCurl(
        `curl -F 'name=John' -F 'age=30' 'https://example.com/upload'`
      )
      expect(parsed!.method).toBe('POST')
      expect(parsed!.body).toEqual({
        type: 'form-data',
        params: [
          { key: 'name', value: 'John', enabled: true },
          { key: 'age', value: '30', enabled: true }
        ]
      })
    })

    it('infers body type from Content-Type header', () => {
      const parsed = parseCurl(
        `curl -H 'Content-Type: application/x-www-form-urlencoded' -d 'foo=bar' 'https://example.com'`
      )
      expect(parsed!.body!.type).toBe('form-urlencoded')
    })

    it('defaults -d without Content-Type to form-urlencoded', () => {
      const parsed = parseCurl(`curl -d 'foo=bar' 'https://example.com'`)
      expect(parsed!.body!.type).toBe('form-urlencoded')
      expect(parsed!.body!.content).toBe('foo=bar')
      expect(parsed!.headers).toContainEqual({
        key: 'Content-Type',
        value: 'application/x-www-form-urlencoded',
        enabled: true
      })
    })

    it('concatenates multiple -d flags with &', () => {
      const parsed = parseCurl(`curl -d 'a=1' -d 'b=2' 'https://example.com'`)
      expect(parsed!.body!.type).toBe('form-urlencoded')
      expect(parsed!.body!.content).toBe('a=1&b=2')
    })

    it('parses --data-urlencode', () => {
      const parsed = parseCurl(`curl --data-urlencode 'name=hello world' 'https://example.com'`)
      expect(parsed!.body!.type).toBe('form-urlencoded')
      expect(parsed!.body!.content).toBe('name%3Dhello%20world')
    })

    it('returns null for non-curl strings', () => {
      expect(parseCurl('https://example.com')).toBeNull()
      expect(parseCurl('not a curl command')).toBeNull()
    })
  })

  describe('toCurl', () => {
    it('generates a simple GET curl', () => {
      const cmd = toCurl({ url: 'https://example.com/api', method: 'GET' })
      expect(cmd).toBe("curl \\n  'https://example.com/api'")
    })

    it('generates POST with headers and body', () => {
      const cmd = toCurl({
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        body: { type: 'json', content: '{"name":"John"}' }
      })
      expect(cmd).toContain("-X POST")
      expect(cmd).toContain("-H 'Content-Type: application/json'")
      expect(cmd).toContain("-d '{\"name\":\"John\"}'")
    })

    it('generates basic auth', () => {
      const cmd = toCurl({
        url: 'https://example.com',
        method: 'GET',
        auth: { type: 'basic', username: 'admin', password: 'secret' }
      })
      expect(cmd).toContain("-u 'admin:secret'")
    })

    it('generates bearer auth as header', () => {
      const cmd = toCurl({
        url: 'https://example.com',
        method: 'GET',
        auth: { type: 'bearer', token: 'tok123' }
      })
      expect(cmd).toContain("-H 'Authorization: Bearer tok123'")
    })

    it('generates form data', () => {
      const cmd = toCurl({
        url: 'https://example.com/upload',
        method: 'POST',
        body: {
          type: 'form-data',
          params: [
            { key: 'name', value: 'John', enabled: true },
            { key: 'file', value: '@photo.jpg', enabled: true }
          ]
        }
      })
      expect(cmd).toContain("-F 'name=John'")
      expect(cmd).toContain("-F 'file=@photo.jpg'")
    })

    it('skips disabled headers', () => {
      const cmd = toCurl({
        url: 'https://example.com',
        method: 'GET',
        headers: [
          { key: 'X-Active', value: 'yes', enabled: true },
          { key: 'X-Disabled', value: 'no', enabled: false }
        ]
      })
      expect(cmd).toContain("-H 'X-Active: yes'")
      expect(cmd).not.toContain('X-Disabled')
    })
  })
})
