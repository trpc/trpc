import fs from 'node:fs'
import path from 'node:path'
import { toNodeHandler } from 'srvx/node'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const port = Number(process.env.PORT ?? 3000)

const startPort = Number(process.env.START_PORT ?? 0)

const isSpaMode = process.env.MODE === 'spa'
const isPrerender = process.env.MODE === 'prerender'
const distDir = process.env.E2E_DIST_DIR || 'dist'
const distClientDir = path.resolve(distDir, 'client')

function resolveDistServerEntryPath() {
  const serverJsPath = path.resolve(distDir, 'server', 'server.js')
  if (fs.existsSync(serverJsPath)) {
    return serverJsPath
  }

  const indexJsPath = path.resolve(distDir, 'server', 'index.js')
  if (fs.existsSync(indexJsPath)) {
    return indexJsPath
  }

  return serverJsPath
}

export async function createStartServer() {
  const distServerEntryPath = resolveDistServerEntryPath()
  const server = (await import(distServerEntryPath)).default
  const nodeHandler = toNodeHandler(server.fetch)

  const app = express()

  // to keep testing uniform stop express from redirecting /posts to /posts/
  // when serving pre-rendered pages
  app.use(express.static(distClientDir, { redirect: !isPrerender }))

  app.use(async (req, res, next) => {
    try {
      await nodeHandler(req, res)
    } catch (error) {
      next(error)
    }
  })

  return { app }
}

export async function createSpaServer(backendPort) {
  const app = express()

  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://localhost:${backendPort}/api`, // Replace with your target server's URL
      changeOrigin: false, // Needed for virtual hosted sites,
    }),
  )

  app.use(
    '/_serverFn',
    createProxyMiddleware({
      target: `http://localhost:${backendPort}/_serverFn`, // Replace with your target server's URL
      changeOrigin: false, // Needed for virtual hosted sites,
    }),
  )

  app.use(express.static(distClientDir))

  app.get('/{*splat}', (req, res) => {
    res.sendFile('index.html', { root: distClientDir })
  })

  return { app }
}

// Bind the backend first so the SPA proxy receives the port actually held by it.
const { app: startApp } = await createStartServer()
const backend = startApp.listen(isSpaMode ? startPort : port, async (error) => {
  if (error) {
    throw error
  }
  const backendPort = backend.address().port
  if (isSpaMode) {
    const { app } = await createSpaServer(backendPort)
    const frontend = app.listen(port, (frontendError) => {
      if (frontendError) {
        throw frontendError
      }
      console.info(`E2E app: http://localhost:${frontend.address().port}`)
    })
  } else {
    console.info(`E2E app: http://localhost:${backendPort}`)
  }
})
