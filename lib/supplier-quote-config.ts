// How a supplier is asked for a price.
//
// OFF (the way it is now): the supplier gets a plain list of what is wanted (the materials, the area, the date, our purchase order number) and quotes from their OWN system, then emails the
// quote as a PDF to the company's quotes address with the purchase order number on it. There is no price form and no link in the request.
// ON: the request also carries a link to the price page (app/supplier-quote/[token]) where the supplier types a price for each item, and the replies line up item by item.
//
// The price page, its server route and everything behind it are still in the app, untouched: a supplier opening an older link still sees it, and switching this to true brings the form back
// into every new request. The form is only used when this is on OR the company has no quotes email address set (a supplier could not reply by email, so the form is the only way).

export const SUPPLIER_PRICE_FORM_ON = false

/** Should this request send the price form link? Always yes when there is nowhere to email a quote to. */
export const showSupplierPriceForm = (inboxEmail: string) => SUPPLIER_PRICE_FORM_ON || !(inboxEmail || '').trim()
