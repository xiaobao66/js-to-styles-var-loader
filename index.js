const path = require('path');
const decache = require('decache');
const squba = require('squba');
const loaderUtils = require('loader-utils');
const stringReplaceAsync = require('string-replace-async');

const requireReg = /@import\s*(["'])([\w.~\/]+\.js)(?:\1)((?:\.[\w_-]+)*);?/igm;

const operator = {

    validateExportType (data, relativePath) {
        if (Object.prototype.toString.call(data) !== '[object Object]') {
            throw new Error(`Export must be an object '${relativePath}'`);
        }
    },

    // Ensure it is a flat object with finite number/string values.
    validateVariablesValue(value, property, relativePath) {
        if (Object.prototype.toString.call(value) !== '[object Object]') {
            throw new Error(`Only an object can be converted to style vars (${relativePath}${property})`);
        }

        const keys = Object.keys(value);
        for (const k of keys) {
            if (!(
                // Define ok types of value (can be output as a style var)
                typeof value[k] === "string"
                || (typeof value[k] === "number" && Number.isFinite(value[k]))
            )) {
                throw new Error(
                    `Style vars must have a value of type "string" or "number". Only flat objects are supported. ` +
                    `In: ${relativePath}${property ? ":" : ""}${property}`);
            }
        }

        return true;
    },

    getVarData (relativePath, property) {
        decache(relativePath);
        const data = require(relativePath);
        if (!data) {
            throw new Error(`No data in '${relativePath}'`);
        }
        this.validateExportType(data, relativePath);
        if (property) {
            const propVal = squba(data, property);
            this.validateExportType(propVal, relativePath);
            this.validateVariablesValue(propVal, property, relativePath)
            return propVal;
        }
        return data;
    },

    transformToSassVars (varData) {
        const keys = Object.keys(varData);
        return keys.reduce( (result, key) => {
            result += `$${key}: ${varData[key]};\n`;
            return result;
        }, '');
    },

    transformToLessVars (varData) {
        const keys = Object.keys(varData);
        return keys.reduce( (result, key) => {
            result += `@${key}: ${varData[key]};\n`;
            return result;
        }, '');
    },

    transformToStyleVars ({ type, varData } = {}) {
        switch (type) {
            case 'sass':
                return this.transformToSassVars(varData);
            case 'less':
                return this.transformToLessVars(varData);
            default:
                throw Error(`Unknown preprocessor type: ${type}`);

        }
    },

    propDeDot (strPropMatch) {
        if (!strPropMatch || strPropMatch[0] !== ".")
            return strPropMatch;
        else
            return strPropMatch.substr(1);
    },

    mergeVarsToContent (content, webpackContext, preprocessorType) {
        const { callback } = webpackContext;

        const replacer = function (m, q, relativePath, property) {
            return new Promise((resolve, reject) => {
                webpackContext.resolve(webpackContext.context, loaderUtils.urlToRequest(relativePath), (err, modulePath) => {
                    if (err) {
                        reject(err);
                    } else {
                        const varData = this.getVarData(modulePath, this.propDeDot(property));
                        webpackContext.addDependency(modulePath);
                        resolve(this.transformToStyleVars({
                            type: preprocessorType,
                            varData
                        }));
                    }
                })
            });
        };

        stringReplaceAsync(content, requireReg, replacer.bind(this))
            .then(result => {
                callback(null, result);
            })
            .catch(err => {
                callback(err);
            });
    },

    getResource (context) {
        return {
            resource: context.resource,
            resourcePath: context.resourcePath,
        };
    },

    getPreprocessorType ( { resource, resourcePath } = {}) {
        const preProcs = [
            {
                type: 'sass',
                reg: /\.scss$|\.sass$/
            },
            {
                type: 'less',
                reg: /\.less$/
            }
        ];

        const result = preProcs.find( item => item.reg.test(resourcePath));
        if (result) return result.type;
        throw Error(`Unknown preprocesor type for ${resource}`);
    }
};

exports.operator = operator;

const loader = function (content) {
    const webpackContext = this;
    const { resource, resourcePath } = operator.getResource(webpackContext);
    const preprocessorType = operator.getPreprocessorType({ resource, resourcePath });
    const done = webpackContext.async();
    const isSync = typeof done !== 'function';

    if (isSync) {
        throw new Error(
            'Synchronous compilation is not supported anymore.'
        );
    }

    operator.mergeVarsToContent(content, webpackContext, preprocessorType);
};

exports.default = loader;
