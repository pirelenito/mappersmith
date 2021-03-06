import Manifest from './manifest'
import Request from './request'
import { assign } from './utils'

/**
 * @typedef ClientBuilder
 * @param {Object} manifest - manifest definition with at least the `resources` key
 * @param {Function} GatewayClassFactory - factory function that returns a gateway class
 */
function ClientBuilder (manifest, GatewayClassFactory, configs) {
  if (!manifest) {
    throw new Error(
      `[Mappersmith] invalid manifest (${manifest})`
    )
  }

  if (!GatewayClassFactory || !GatewayClassFactory()) {
    throw new Error(
      '[Mappersmith] gateway class not configured (configs.gateway)'
    )
  }

  const defaultGatewayConfigs = configs.gatewayConfigs
  const defaultMiddleware = configs.middleware
  this.context = configs.context

  this.manifest = new Manifest(manifest, defaultGatewayConfigs, defaultMiddleware)
  this.GatewayClassFactory = GatewayClassFactory
}

ClientBuilder.prototype = {
  build () {
    const client = { _manifest: this.manifest }

    this.manifest.eachResource((name, methods) => {
      client[name] = this.buildResource(name, methods)
    })

    return client
  },

  buildResource (resourceName, methods) {
    return methods.reduce((resource, method) => assign(resource, {
      [method.name]: (requestParams) => {
        const request = new Request(method.descriptor, requestParams)
        return this.invokeMiddlewares(resourceName, method.name, request)
      }
    }), {})
  },

  invokeMiddlewares (resourceName, resourceMethod, initialRequest) {
    const context = assign({}, this.context)
    const middleware = this.manifest.createMiddleware({ resourceName, resourceMethod, context })
    const finalRequest = middleware
      .reduce((request, middleware) => middleware.request(request), initialRequest)

    const GatewayClass = this.GatewayClassFactory()
    const gatewayConfigs = this.manifest.gatewayConfigs
    const callGateway = () => new GatewayClass(finalRequest, gatewayConfigs).call()

    const execute = middleware
      .reduce(
        (next, middleware) => () => middleware.response(next),
        callGateway
      )

    return execute()
  }
}

export default ClientBuilder
