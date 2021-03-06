import {HttpResponse, HttpRequest} from 'uWebSockets.js'
import getReqAuth from '../utils/getReqAuth'
import safetyPatchRes from '../safetyPatchRes'
import sendToSentry from '../utils/sendToSentry'

export type uWSHandler = (res: HttpResponse, req: HttpRequest) => void
const uWSAsyncHandler = (handler: uWSHandler, ignoreDone?: boolean) => async (
  res: HttpResponse,
  req: HttpRequest
) => {
  const authToken = getReqAuth(req)
  safetyPatchRes(res)
  try {
    await handler(res, req)
    if (!ignoreDone && !res.done) {
      throw new Error('Async handler did not respond')
    }
  } catch (e) {
    res.writeStatus('500').end()
    sendToSentry(e, {userId: authToken.sub})
  }
}

export default uWSAsyncHandler
