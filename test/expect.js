/*
 * Copyright (c) 2019 Jens Hauke. All rights reserved.
 *
 * 2019-10-05 Jens Hauke <jens@4k2.de>
 */
'use strict';

(function () {
	function compare() {
		for (const el of document.querySelectorAll("[expect]")) {
			const elFilter = el.cloneNode(true);
			// Filter out all "<template>" marker
			[...elFilter.querySelectorAll("template")].forEach(el => el.parentNode.removeChild(el));

			const result = elFilter.innerHTML.replace(/\s+/g, ' ').trim();
			const expect = el.getAttribute("expect");

			const resEl = document.createElement("div");
			resEl.classList.add("result");
			if (result == expect) {
				resEl.innerHTML = "Ok<pre></pre>";
				resEl.classList.add("ok");
				resEl.firstElementChild.innerText = result;
			} else {
				resEl.classList.add("fail");
				resEl.innerText = `Failed!
Expect:
  "${expect}"
Result:
  "${result}"`;
				const resQuoted = result.replace(/"/g, "&quot;");
				console.log("Failed test:", el, "Result:\n" + resQuoted);
				resEl.onclick = () => resEl.innerText = resQuoted;
			}

			el.parentNode.insertBefore(resEl, el.nextSibling);
		}
	}

	function delayed_compare() {
		setTimeout(compare, 20); // Call compare after xx.render is done
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", delayed_compare);
	} else {  // `DOMContentLoaded` already fired
		delayed_compare();
	}
}());
