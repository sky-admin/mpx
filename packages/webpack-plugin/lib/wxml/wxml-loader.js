const htmlMinifier = require('html-minifier')
const attrParse = require('./attributesParser')
const loaderUtils = require('loader-utils')
const path = require('path')
const hash = require('hash-sum')
const config = require('../config')
const getMainCompilation = require('../utils/get-main-compilation')
const createHelpers = require('../helpers')

function randomIdent () {
  return 'xxxHTMLLINKxxx' + Math.random() + Math.random() + 'xxx'
}

module.exports = function (content) {
  const loaderContext = this
  const isProduction = this.minimize || process.env.NODE_ENV === 'production'
  const options = loaderUtils.getOptions(this) || {}

  const filePath = this.resourcePath

  const context = (
    this.rootContext ||
    (this.options && this.options.context) ||
    process.cwd()
  )
  const shortFilePath = path.relative(context, filePath).replace(/^(\.\.[\\/])+/, '')
  const moduleId = hash(isProduction ? (shortFilePath + '\n' + content) : shortFilePath)

  const needCssSourceMap = (
    !isProduction &&
    this.sourceMap &&
    options.cssSourceMap !== false
  )

  const hasScoped = false
  const hasComment = false
  const isNative = true

  const usingComponents = []

  const mainCompilation = getMainCompilation(this._compilation)
  const mode = mainCompilation.__mpx__.mode

  const {
    getSrcRequestString
  } = createHelpers(
    loaderContext,
    options,
    moduleId,
    isProduction,
    hasScoped,
    hasComment,
    usingComponents,
    needCssSourceMap,
    mode,
    isNative
  )

  const attributes = ['image:src', 'audio:src', 'video:src', 'cover-image:src', 'import:src', `${config[mode].wxs.tag}:${config[mode].wxs.src}`]
  const root = '/'
  const links = attrParse(content, function (tag, attr) {
    const res = attributes.find(function (a) {
      if (a.charAt(0) === ':') {
        return attr === a.slice(1)
      } else {
        return (tag + ':' + attr) === a
      }
    })
    return !!res
  })
  links.reverse()
  const data = {}
  content = [content]
  links.forEach(function (link) {
    if (!loaderUtils.isUrlRequest(link.value, root)) return

    if (link.value.indexOf('mailto:') > -1) return

    let uri = new URL(link.value)
    if (uri.hash !== null && uri.hash !== undefined) {
      uri.hash = null
      link.value = uri.format()
      link.length = link.value.length
    }

    let ident
    do {
      ident = randomIdent()
    } while (data[ident])
    data[ident] = link
    let x = content.pop()
    content.push(x.substr(link.start + link.length))
    content.push(ident)
    content.push(x.substr(0, link.start))
  })
  content.reverse()
  content = content.join('')

  if (typeof options.minimize === 'boolean' ? options.minimize : this.minimize) {
    const minimizeOptions = Object.assign({}, options);
    [
      'removeComments',
      'removeCommentsFromCDATA',
      'removeCDATASectionsFromCDATA',
      'collapseWhitespace',
      'conservativeCollapse',
      'removeAttributeQuotes',
      'useShortDoctype',
      'keepClosingSlash',
      'minifyJS',
      'minifyCSS',
      'removeScriptTypeAttributes',
      'removeStyleTypeAttributes'
    ].forEach(function (name) {
      if (typeof minimizeOptions[name] === 'undefined') {
        minimizeOptions[name] = true
      }
    })
    content = htmlMinifier.minify(content, minimizeOptions)
  }

  content = JSON.stringify(content)

  const exportsString = 'module.exports = '

  return exportsString + content.replace(/xxxHTMLLINKxxx[0-9.]+xxx/g, function (match) {
    if (!data[match]) return match

    const link = data[match]

    let src = loaderUtils.urlToRequest(link.value, root)

    let requestString

    switch (link.tag) {
      case 'import':
        requestString = getSrcRequestString('template', { src }, -1)
        break
      case config[mode].wxs.tag:
        requestString = getSrcRequestString('wxs', { src }, -1)
        break
      default:
        requestString = JSON.stringify(src)
    }

    return '" + require(' + requestString + ') + "'
  }) + ';'
}