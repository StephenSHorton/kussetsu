//! HTML rail for the WASM catalog. Real <a href="?c="> links.

use std::cell::RefCell;
use std::rc::Rc;

use kussetsu::catalog::{self, Status};
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use wasm_bindgen::closure::Closure;
use web_sys::{Document, HtmlElement};

pub fn initial_slug() -> String {
    web_sys::window()
        .and_then(|w| w.location().search().ok())
        .and_then(|q| {
            q.trim_start_matches('?')
                .split('&')
                .find_map(|p| p.strip_prefix("c=").map(|s| s.to_string()))
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "welcome".into())
}

pub fn mount(slug: Rc<RefCell<String>>) {
    let Some(window) = web_sys::window() else { return };
    let Some(document) = window.document() else { return };
    if document.get_element_by_id("nav").is_none() {
        return;
    }
    render(&document, &slug.borrow());
    bind_nav(&document, slug.clone());
    bind_filter(&document, slug.clone());
    let slug_pop = slug.clone();
    let on_pop = Closure::wrap(Box::new(move |_ev: web_sys::Event| {
        let next = initial_slug();
        *slug_pop.borrow_mut() = next.clone();
        if let Some(doc) = web_sys::window().and_then(|w| w.document()) {
            render(&doc, &next);
            paint_meta(&doc, &next);
        }
    }) as Box<dyn FnMut(_)>);
    let _ = window.add_event_listener_with_callback("popstate", on_pop.as_ref().unchecked_ref());
    on_pop.forget();
    paint_meta(&document, &slug.borrow());
}

fn render(document: &Document, current: &str) {
    let Some(nav) = document.get_element_by_id("nav") else { return };
    nav.set_inner_html("");
    let mut last = "";
    for e in catalog::CATALOG {
        if e.group != last {
            last = e.group;
            if let Ok(g) = document.create_element("div") {
                g.set_class_name("group");
                g.set_text_content(Some(e.group));
                let _ = nav.append_child(&g);
            }
        }
        if let Ok(a) = document.create_element("a") {
            let _ = a.set_attribute("href", &format!("?c={}", e.slug));
            let _ = a.set_attribute("data-slug", e.slug);
            let cls = match e.status {
                Status::Done => "done",
                Status::Wip => "wip",
                Status::Todo => "todo",
            };
            a.set_class_name(cls);
            if e.slug == current {
                let _ = a.set_attribute("aria-current", "page");
            }
            a.set_inner_html(&format!("<i class=\"dot\"></i>{}", e.name));
            let _ = nav.append_child(&a);
        }
    }
}

fn paint_meta(document: &Document, slug: &str) {
    let e = catalog::find(slug);
    if let Some(el) = document.get_element_by_id("story-title") {
        el.set_text_content(Some(e.name));
    }
    if let Some(el) = document.get_element_by_id("story-blurb") {
        el.set_text_content(Some(e.blurb));
    }
    if let Some(el) = document.get_element_by_id("story-status") {
        let cls = match e.status {
            Status::Done => "pill done",
            Status::Wip => "pill wip",
            Status::Todo => "pill",
        };
        el.set_class_name(cls);
        el.set_text_content(Some(match e.status {
            Status::Done => "done",
            Status::Wip => "wip",
            Status::Todo => "todo",
        }));
    }
    document.set_title(&format!("{} · kussetsu/ui", e.name));
}

fn bind_nav(document: &Document, slug: Rc<RefCell<String>>) {
    let Some(nav) = document.get_element_by_id("nav") else { return };
    let slug_c = slug.clone();
    let on_click = Closure::wrap(Box::new(move |ev: web_sys::MouseEvent| {
        if ev.meta_key() || ev.ctrl_key() || ev.shift_key() || ev.alt_key() {
            return;
        }
        let Some(t) = ev.target() else { return };
        let Ok(el) = t.dyn_into::<HtmlElement>() else { return };
        let Some(a) = (if el.tag_name() == "A" {
            Some(el)
        } else {
            el.closest("a").ok().flatten().and_then(|n| n.dyn_into::<HtmlElement>().ok())
        }) else {
            return;
        };
        let Some(next) = a.get_attribute("data-slug") else { return };
        ev.prevent_default();
        if let Some(hist) = web_sys::window().and_then(|w| w.history().ok()) {
            let _ = hist.push_state_with_url(&JsValue::NULL, "", Some(&format!("?c={next}")));
        }
        *slug_c.borrow_mut() = next.clone();
        if let Some(doc) = web_sys::window().and_then(|w| w.document()) {
            render(&doc, &next);
            paint_meta(&doc, &next);
        }
    }) as Box<dyn FnMut(_)>);
    let _ = nav.add_event_listener_with_callback("click", on_click.as_ref().unchecked_ref());
    on_click.forget();
}

fn bind_filter(document: &Document, slug: Rc<RefCell<String>>) {
    let Some(input) = document.get_element_by_id("filter") else { return };
    let slug_c = slug;
    let on_input = Closure::wrap(Box::new(move |_ev: web_sys::Event| {
        let Some(doc) = web_sys::window().and_then(|w| w.document()) else { return };
        let q = doc
            .get_element_by_id("filter")
            .and_then(|e| e.dyn_into::<web_sys::HtmlInputElement>().ok())
            .map(|i| i.value().to_lowercase())
            .unwrap_or_default();
        let current = slug_c.borrow().clone();
        render(&doc, &current);
        if q.is_empty() {
            return;
        }
        if let Some(nav) = doc.get_element_by_id("nav") {
            // hide non-matching links
            let children = nav.children();
            for i in 0..children.length() {
                if let Some(node) = children.item(i) {
                    if let Ok(el) = node.dyn_into::<HtmlElement>() {
                        if el.class_name() == "group" {
                            continue;
                        }
                        let text = el.text_content().unwrap_or_default().to_lowercase();
                        let show = text.contains(&q);
                        el.set_attribute("style", if show { "" } else { "display:none" }).ok();
                    }
                }
            }
        }
    }) as Box<dyn FnMut(_)>);
    let _ = input.add_event_listener_with_callback("input", on_input.as_ref().unchecked_ref());
    on_input.forget();
}
