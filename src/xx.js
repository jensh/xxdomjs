/*
 * Copyright (c) 2018, 2019 Jens Hauke. All rights reserved.
 *
 * 2018-11-28 Jens Hauke <jens@4k2.de>
 *
 * Criss-cross incremental DOM renderer
 * xxdom  https://github.com/jensh/xxdomjs
 *
 * Released under the MIT License.
 */

xx = (function () {
	'use strict';

	class XxTemplate {
		constructor(tmpl) {
			this.tmpl = document.createDocumentFragment();
			this.tmpl.appendChild(tmpl);
		}

		paste(elTarget, scope) {
			const el = this.tmpl.firstElementChild.cloneNode(true);
			elTarget.parentNode.replaceChild(el, elTarget);

			// Copy attributes to new node
			for (const attr of elTarget.attributes) {
				let v = attr.value;
				switch (attr.name) {
				case 'class':
					v += ' ' + el.getAttribute('class'); // append tmpl class names
					break;
				}
				el.setAttribute(attr.name, v);
			}
		}
	}

	let xx = {
		debug: false,
		noinit: false,
		recycleDOMnodes: true, // Faster, but DOM nodes change scope on the fly (un-keyed)
		_tmpl: {}, // templates

		_applyTmpl(root, scope) {
			for (const [cname, comp] of Object.entries(this._tmpl)) {
				// Use lowercase tag names to work also within SVG
				for (const el of root.querySelectorAll(cname.toLowerCase())) {
					comp.paste(el, scope);
				}
			}
		},

		_initTree(root, scope) {
			// init Components
			for (const el of [...root.querySelectorAll('[xx-component]')].reverse()) {
				const name = el.getAttribute('xx-component');
				let tmpl = (el.content && el.content.firstElementChild) || el;
				tmpl.removeAttribute('xx-component');
				this._tmpl[name] = new XxTemplate(tmpl); // register
			}
			for (const [cname, comp] of Object.entries(this._tmpl)) {
				this._applyTmpl(comp.tmpl, scope);
			}
			this._applyTmpl(root, scope);
		},

		init(root=document, rootScope=window) {
			delete this.init; // call init only once
			deb('xx.init()');
			this._initTree(root, rootScope);
		},

		render() {
			if (this.init) this.init();
			deb('xx.render()');
		}
	};

	function deb(...args) {
		if (xx.debug) console.log(...args);
	}

	try {
		xx.noinit = document.currentScript.src.indexOf('#noinit') > 0;
		xx.debug = document.currentScript.src.indexOf('#debug') > 0;
	} catch (err) {
	}

	// Render all nodes after DOMContentLoaded
	if (!xx.noinit) {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", render);
		} else {  // `DOMContentLoaded` already fired
			render();
		}
	}

	function render() {
		try {
			// Calling xx() is forwarded to xx.render().
			xx.render();
		} catch (err) {
			console.log(err);
		}
	}

	return xx = Object.assign(render, xx);
}());
