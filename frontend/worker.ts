import { Hono } from 'hono'

type Bindings = {
  API_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.all('/api/*', async (c) => {
  const apiUrl = c.env.API_URL
  const url = new URL(c.req.path.replace(/^\/api/, ''), apiUrl)
  url.search = new URL(c.req.url).search

  const headers = new Headers(c.req.raw.headers)
  headers.set('Host', new URL(apiUrl).host)

  try {
    const res = await fetch(url.toString(), {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
      redirect: 'manual',
    })

    return res
  } catch (err) {
    return c.json({ error: 'Upstream error', detail: String(err) }, 502)
  }
})

export default app
