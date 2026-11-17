// Express 4 does not catch errors thrown by `async` route handlers: the
// handler returns a rejected promise, nobody awaits it, and on Node 15+
// the unhandled rejection kills the whole process. One bad request (for
// example a malformed id that makes Postgres throw) could take the API
// down for everyone.
//
// This patches Express 4's Layer so that when a handler returns a promise
// that rejects, the error goes to next(err) and lands in the app's error
// handler as a normal 500. It does the same thing as the
// `express-async-errors` package, without adding a dependency. Remove it
// when moving to Express 5, which does this natively.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Layer = require('express/lib/router/layer.js');

if (!Layer.prototype.__asyncPatched) {
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // not a standard request handler
    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.catch === 'function') ret.catch(next);
    } catch (err) {
      next(err);
    }
  };

  Layer.prototype.handle_error = function handle_error(error, req, res, next) {
    const fn = this.handle;
    if (fn.length !== 4) return next(error); // not an error handler
    try {
      const ret = fn(error, req, res, next);
      if (ret && typeof ret.catch === 'function') ret.catch(next);
    } catch (err) {
      next(err);
    }
  };

  Layer.prototype.__asyncPatched = true;
}
