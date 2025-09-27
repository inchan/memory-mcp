module.exports = (request, options) => {
  const defaultResolver =
    options.defaultResolver || require('jest-resolve/build/defaultResolver');

  if (request.endsWith('.js')) {
    const tsRequest = request.replace(/\.js$/, '.ts');

    try {
      return defaultResolver(tsRequest, options);
    } catch (error) {
      // fallback to original request
    }
  }

  return defaultResolver(request, options);
};
