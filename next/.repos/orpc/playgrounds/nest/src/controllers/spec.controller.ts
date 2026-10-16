import { Controller, Get, Header } from '@nestjs/common'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { contract } from '../contracts'

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
})

@Controller()
export class SpecController {
  constructor() {}

  @Get('/')
  @Header('Content-Type', 'text/html')
  scalar() {
    return `
        <!doctype html>
        <html>
        <head>
            <title>ORPC Playground</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" type="image/svg+xml" href="https://orpc.dev/icon.svg" />
        </head>
        <body>
            <script
            id="api-reference"
            data-url="/spec.json"
            data-configuration="${JSON.stringify({
              authentication: {
                securitySchemes: {
                  bearerAuth: {
                    token: 'default-token',
                  },
                },
              },
            }).replaceAll('"', '&quot;')}">
            </script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        </body>
        </html>
    `
  }

  @Get('spec.json')
  spec() {
    return generator.generate(contract, {
      base: {
        servers: [{ url: '/' }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      },
    })
  }
}
