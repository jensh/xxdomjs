/*
 * Copyright (c) 2018 Jens Hauke. All rights reserved.
 *
 * 2018-12-05 Jens Hauke <jens@4k2.de>
 */

/*
  This file holds alternative implementation for some functions.
  Most of them are probably
  * time critical
  * might be incompatible with your browser

  They are pasted her, just to not get lost.
*/

{
	// Alternative implementations


	// Manual walk seams to be slower than elRoot.querySelectorAll('[xx-bind],[type=xx-for-marker]');
	// ~10ms per 1000 items
	// Clone a DOM node including its xx properties
	function cloneNode(el, newScope) {
		const elRoot = el.cloneNode(true);

		elRoot.xx = newScope;
		elRoot.xxChildNodes = [];

		walk(elRoot, el);

		return elRoot;

		function walk(elDest, elSrc) {
			if (elSrc.xxFoo) {
				elDest.xx = newScope;
				elDest.xxFoo = elSrc.xxFoo;
				elRoot.xxChildNodes.push(elDest);
			}
			let iDest = elDest.firstChild, iSrc = elSrc.firstChild;
			while (iDest && iSrc) {
				walk(iDest, iSrc);
				iDest = iDest.nextSibling;
				iSrc = iSrc.nextSibling;
			}
		}
	}


	// Fastest. Needs el.getAttribute('xxFoo.id')
	// Clone a DOM node including its xx properties
	function cloneNode(el, newScope) {
		const elRoot = el.cloneNode(true);
		elRoot.xx = newScope
		xx.propagateScope(elRoot, newScope);
		return elRoot;
	}


	{
		// Might use:
		//  el.textContent
		//  el.data
		//  el.nodeValue

		// document.createTreeWalker

		*getAllXxHandlebarNodes(rootnode = document.body) {
			const walker = document.createTreeWalker(
				rootnode, NodeFilter.SHOW_TEXT,
				{
					acceptNode(el) {
						return (/{{.*}}/.test(el.textContent)) ?
							NodeFilter.FILTER_ACCEPT :
							NodeFilter.FILTER_REJECT;
					}
				}
			);
			let el;
			while (el = walker.nextNode()) {
				yield el;
			}
		},

		// document.createNodeIterator(root, whatToShow, filter);
		*getAllXxHandlebarNodes(rootnode = document.body) {
			const walker = document.createNodeIterator(
				rootnode, NodeFilter.SHOW_TEXT,
				el => (/{{.*}}/.test(el.textContent))
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT
			);
			for (let el; el = walker.nextNode();) {
				yield el;
			}
		},

	}



}
