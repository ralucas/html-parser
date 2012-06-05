var parseContext = require('./context');

var elementNameRegex = /[a-zA-Z_][\w-]*/;
var attributeNameRegex = elementNameRegex;

function parseOpenElement(context) {
	function readAttribute() {
		var name = context.readRegex(attributeNameRegex);
		var value = null;
		if (context.current === '=' || context.peekIgnoreWhitespace() === '=') {
			context.readRegex(/\s*=\s*/);
			var quote = /['"]/.test(context.current) ? context.current : '';
			var attributeRegex = !quote
				? /(.*?)[\s>]/
				: new RegExp(quote + '(.*?)' + quote) ;

			var match = attributeRegex.exec(context.substring) || [0, ''];
			value = match[1];
			context.read(match[0].length);
		}

		context.callbacks.attribute(name, value);
	}

	var name = context.readRegex(elementNameRegex);
	context.callbacks.openElement(name);

	//read attributes
	var next = context.current;
	while (!context.isEof() && next !== '>') {
		if (attributeNameRegex.test(next)) {
			readAttribute();
			next = context.current;
		}
		else {
			next = context.read();
		}
	}

	//the last ">"
	context.read();
}

function parseEndElement(context) {
	var name = context.readRegex(elementNameRegex);
	context.callbacks.closeElement(name);
	context.readRegex(/.*?(?:>|$)/);
}

function parseCData(context) {
	//read "![CDATA["
	context.read(8);

	var match = /^([\s\S]*?)(?:$|]]>)/.exec(context.substring);
	var value = match[1];
	context.read(value.length + match[0].length);
	context.callbacks.cdata(value);
}

function parseComment(context) {
	//read "!--"
	context.read(3);

	var match = /^([\s\S]*?)(?:$|-->)/.exec(context.substring);
	var value = match[1];
	context.read(value.length + match[0].length);
	context.callbacks.comment(value);
}

function appendText(value, context) {
	context.text.value += value;
}

function callbackText(context) {
	if (context.text.value) {
		context.callbacks.text(context.text.value);
		context.text.value = '';
	}
}

function parseNext(context) {
	var current = context.current, buffer = current;
	switch (current) {
		case '<':
			buffer += context.readUntilNonWhitespace();
			if (context.current === '/') {
				buffer += context.readUntilNonWhitespace();
				if (elementNameRegex.test(context.current)) {
					callbackText(context);
					parseEndElement(context);
				} else {
					//malformed html, let it slide through
					appendText(buffer, context);
				}
			}
			else if (context.current === '!') {
				if (/^!\[CDATA\[/.test(context.substring)) {
					callbackText(context);
					parseCData(context);
				} else if (/^!--/.test(context.substring)) {
					callbackText(context);
					parseComment(context);
				} else {
					//malformed html
					appendText(buffer + '!', context);
				}
			}
			else if (elementNameRegex.test(context.current)) {
				callbackText(context);
				parseOpenElement(context);
			}
			else {
				//malformed html, let it slide through
				context.read();
				appendText(buffer, context);
			}

			break;
		default:
			appendText(context.current, context);
			context.read();
			break;
	}
}

exports.parse = function(string, options) {
	var context = parseContext.create(string, options);
	do {
		parseNext(context);
	} while (!context.isEof());

	callbackText(context);
};