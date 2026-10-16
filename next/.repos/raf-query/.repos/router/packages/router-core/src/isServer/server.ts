export const isServer = process.env.NODE_ENV === 'test' ? undefined : true
export { loadServerRoute } from '../load-server'
