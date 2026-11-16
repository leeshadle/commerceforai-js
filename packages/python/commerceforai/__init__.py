"""CommerceForAI for Python: products, inventory, Stripe checkout, orders, shipping, returns, subscriptions and
gift cards on the merchant's own Stripe account.

    from commerceforai import Commerce, create_test_store

    store = create_test_store("My shop")            # free test store, no sign-up
    commerce = Commerce(store["api_key"])           # or Commerce() with COMMERCEFORAI_API_KEY set
    product = commerce.products.create(name="Trail Tee", price=3600, inventory=25)
    checkout = commerce.checkouts.create(items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
                                         success_url="https://example.com/thanks")
    print(checkout["url"])

Every method returns the API's JSON as plain dicts and lists. Money is an integer in cents. API errors raise
CommerceError, which carries `type`, `message` and any extra fields (for example `param`, `available`, `limit`).
No dependencies: standard library only. Agent guide: https://commerceforai.com/llms.txt
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Mapping, Optional

__version__ = "0.1.0"
__all__ = ["Commerce", "CommerceError", "create_test_store", "verify_webhook"]

DEFAULT_BASE_URL = "https://api.commerceforai.com"


class CommerceError(Exception):
    """An error returned by the API. `type` is e.g. invalid_request, out_of_stock, permission_error, not_found."""

    def __init__(self, type: str, message: str, status: int = 0, **extra: Any):
        super().__init__(message)
        self.type, self.message, self.status, self.extra = type, message, status, extra

    def __getattr__(self, name: str) -> Any:  # error.param, error.available, error.limit ...
        try:
            return self.__dict__["extra"][name]
        except KeyError:
            raise AttributeError(name) from None

    def __str__(self) -> str:
        return f"[{self.type}] {self.message}"


def _send(method: str, url: str, headers: dict, body: Any = None, timeout: float = 30.0, retries: int = 2) -> Any:
    data = None if body is None else json.dumps(body).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                text = res.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            e.close()
            # Safe to retry: GETs, and POSTs because each carries an Idempotency-Key.
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(min(float(e.headers.get("Retry-After") or 0.5 * 2 ** attempt), 10))
                continue
            try:
                err = json.loads(text).get("error") or {}
            except ValueError:
                err = {}
            extra = {k: v for k, v in err.items() if k not in ("type", "message")}
            raise CommerceError(err.get("type", "api_error"), err.get("message", text[:300] or f"HTTP {e.code}"), e.code, **extra) from None
        except urllib.error.URLError as e:
            if attempt < retries:
                time.sleep(0.5 * 2 ** attempt)
                continue
            raise CommerceError("connection_error", f"Couldn't reach {url}: {e.reason}") from None


def create_test_store(name: Optional[str] = None, base_url: str = DEFAULT_BASE_URL) -> dict:
    """Create a free test-mode store with no sign-up. Returns { store_id, api_key, claim_url, ... }.
    Give claim_url to the person who owns the project; keep api_key in COMMERCEFORAI_API_KEY."""
    return _send("POST", f"{base_url.rstrip('/')}/sandbox/stores", {"content-type": "application/json", "user-agent": f"commerceforai-python/{__version__}"},
                 {"name": name} if name else {})


def verify_webhook(payload: str | bytes, headers: Mapping[str, str], secret: str, tolerance_seconds: int = 300) -> dict:
    """Check a webhook's signature and return the event. Pass the raw request body, not parsed JSON.
    Raises ValueError if the signature is missing, wrong or too old."""
    get = lambda k: headers.get(k) or headers.get(k.title()) or headers.get(k.upper())  # noqa: E731
    msg_id, ts, sig_header = get("webhook-id"), get("webhook-timestamp"), get("webhook-signature")
    if not (msg_id and ts and sig_header):
        raise ValueError("Missing webhook-id, webhook-timestamp or webhook-signature header")
    if not ts.isdigit() or abs(time.time() - int(ts)) > tolerance_seconds:
        raise ValueError("Webhook timestamp outside tolerance")
    body = payload.decode() if isinstance(payload, bytes) else payload
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()).decode()
    for part in sig_header.split(" "):
        version, _, sig = part.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return json.loads(body)
    raise ValueError("Invalid webhook signature")


class _Resource:
    def __init__(self, client: "Commerce"):
        self._c = client


def _q(value: Any) -> str:
    return urllib.parse.quote(str(value), safe="")


class _Products(_Resource):
    def create(self, **params: Any) -> dict:
        """name plus price (and inventory, sku), or name plus variants=[{name, price, inventory?, sku?, recurring?}]."""
        return self._c.request("POST", "/v1/products", params)

    def create_many(self, products: list) -> dict:
        """Up to 100 at once; each succeeds or fails on its own."""
        return self._c.request("POST", "/v1/products/bulk", {"products": products})

    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/products", query=query)

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/v1/products/{_q(id)}")

    def update(self, id: str, **params: Any) -> dict:
        return self._c.request("PATCH", f"/v1/products/{_q(id)}", params)

    def archive(self, id: str) -> dict:
        return self._c.request("DELETE", f"/v1/products/{_q(id)}")

    def add_variant(self, id: str, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/products/{_q(id)}/variants", params)


class _Variants(_Resource):
    def update(self, id: str, **params: Any) -> dict:
        return self._c.request("PATCH", f"/v1/variants/{_q(id)}", params)


class _Inventory(_Resource):
    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/inventory", query=query)

    def adjust(self, variant_id: str, by: int, reason: Optional[str] = None) -> dict:
        """Add (or with a negative number, remove) units."""
        return self._c.request("POST", f"/v1/variants/{_q(variant_id)}/inventory", {"adjust": by, **({"reason": reason} if reason else {})})

    def set(self, variant_id: str, on_hand: int, reason: Optional[str] = None) -> dict:
        return self._c.request("POST", f"/v1/variants/{_q(variant_id)}/inventory", {"set": on_hand, **({"reason": reason} if reason else {})})


class _Checkouts(_Resource):
    def create(self, **params: Any) -> dict:
        """items=[{variant_id, quantity}], success_url, plus optional customer_email, discount_code, cancel_url.
        Send the customer to the returned `url`. Stock is held until they pay or the checkout expires."""
        return self._c.request("POST", "/v1/checkouts", params)

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/v1/checkouts/{_q(id)}")


class _Orders(_Resource):
    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/orders", query=query)

    def get(self, id: str | int) -> dict:
        """By id or order number."""
        return self._c.request("GET", f"/v1/orders/{_q(id)}")

    def update(self, id: str | int, **params: Any) -> dict:
        return self._c.request("PATCH", f"/v1/orders/{_q(id)}", params)

    def fulfill(self, id: str | int, **params: Any) -> dict:
        """carrier, tracking_number, tracking_url; items=[...] ships part of the order."""
        return self._c.request("POST", f"/v1/orders/{_q(id)}/fulfill", params)

    def refund(self, id: str | int, **params: Any) -> dict:
        """amount in cents (default: everything left), restock, reason."""
        return self._c.request("POST", f"/v1/orders/{_q(id)}/refund", params)

    def edit(self, id: str | int, **params: Any) -> dict:
        """Before it ships: replace, remove, add, shipping_address, email. dry_run=True previews the refund."""
        return self._c.request("POST", f"/v1/orders/{_q(id)}/edit", params)

    def shipping_rates(self, id: str | int, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/orders/{_q(id)}/shipping-rates", params)

    def buy_label(self, id: str | int, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/orders/{_q(id)}/labels", params)


class _Returns(_Resource):
    def create(self, order_id: str | int, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/orders/{_q(order_id)}/returns", params)

    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/returns", query=query)

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/v1/returns/{_q(id)}")

    def approve(self, id: str, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/returns/{_q(id)}/approve", params)

    def reject(self, id: str, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/returns/{_q(id)}/reject", params)

    def receive(self, id: str, **params: Any) -> dict:
        return self._c.request("POST", f"/v1/returns/{_q(id)}/receive", params)


class _Crud(_Resource):
    """list / create / get / update for a collection-style endpoint."""
    path = ""

    def list(self, **query: Any) -> dict:
        return self._c.request("GET", self.path, query=query)

    def create(self, **params: Any) -> dict:
        return self._c.request("POST", self.path, params)

    def get(self, id: str | int) -> dict:
        return self._c.request("GET", f"{self.path}/{_q(id)}")

    def update(self, id: str | int, **params: Any) -> dict:
        return self._c.request("PATCH", f"{self.path}/{_q(id)}", params)


class _Collections(_Crud):
    path = "/v1/collections"

    def delete(self, id: str) -> dict:
        return self._c.request("DELETE", f"{self.path}/{_q(id)}")


class _Discounts(_Crud):
    path = "/v1/discounts"

    def delete(self, id: str) -> dict:
        return self._c.request("DELETE", f"{self.path}/{_q(id)}")


class _DraftOrders(_Crud):
    path = "/v1/draft_orders"

    def send_invoice(self, id: str | int, **params: Any) -> dict:
        return self._c.request("POST", f"{self.path}/{_q(id)}/send_invoice", params)

    def cancel(self, id: str | int) -> dict:
        return self._c.request("POST", f"{self.path}/{_q(id)}/cancel", {})


class _GiftCards(_Crud):
    path = "/v1/gift_cards"

    def send(self, id: str, **params: Any) -> dict:
        return self._c.request("POST", f"{self.path}/{_q(id)}/send", params)


class _Approvals(_Resource):
    """Requests over an API key's cap that went to the store owner. Read them here; only the owner approves, in the dashboard."""

    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/approvals", query=query)

    def get(self, id: str) -> dict:
        """Poll after an approval_required error: once approved, `result` holds the response of the change CommerceForAI made."""
        return self._c.request("GET", f"/v1/approvals/{_q(id)}")


class _Subscriptions(_Resource):
    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/subscriptions", query=query)

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/v1/subscriptions/{_q(id)}")

    def cancel(self, id: str, at_period_end: bool = True) -> dict:
        return self._c.request("POST", f"/v1/subscriptions/{_q(id)}/cancel", {"at_period_end": at_period_end})

    def resume(self, id: str) -> dict:
        return self._c.request("POST", f"/v1/subscriptions/{_q(id)}/resume", {})

    def simulate_renewal(self, id: str) -> dict:
        """Test stores: run the next renewal now and get the order it creates."""
        return self._c.request("POST", f"/v1/subscriptions/{_q(id)}/simulate_renewal", {})


class _Customers(_Resource):
    def list(self, **query: Any) -> dict:
        return self._c.request("GET", "/v1/customers", query=query)

    def get(self, email: str) -> dict:
        return self._c.request("GET", f"/v1/customers/{_q(email)}")

    def update(self, email: str, **params: Any) -> dict:
        """tax_exempt=True marks the customer exempt from sales tax on checkouts created with their email."""
        return self._c.request("PATCH", f"/v1/customers/{_q(email)}", params)


class _Store(_Resource):
    def get(self) -> dict:
        return self._c.request("GET", "/v1/store")

    def update(self, **params: Any) -> dict:
        return self._c.request("PATCH", "/v1/store", params)

    def setup_status(self) -> dict:
        """What's left before the store can take real orders, each with the exact fix. Call this first."""
        return self._c.request("GET", "/v1/setup_status")

    def simulate_order(self, **params: Any) -> dict:
        """Test stores: run a full purchase without a browser. items=[{variant_id, quantity}], fulfill=True to ship it."""
        return self._c.request("POST", "/v1/simulate/order", params)

    def go_live_link(self) -> dict:
        """A link for the owner: sign in, copy the store to live mode, connect Stripe."""
        return self._c.request("POST", "/v1/go_live_links", {})

    def configure_checkout_shipping(self, **params: Any) -> dict:
        """countries=["US"], rates=[{name, amount}], free_over=7500"""
        return self._c.request("PUT", "/v1/store/checkout-shipping", params)

    def usage(self) -> dict:
        return self._c.request("GET", "/v1/store/usage")


class _Events(_Resource):
    def list(self, **query: Any) -> dict:
        """after=<event id>, type="order.*", limit. Poll this instead of webhooks if that's simpler."""
        return self._c.request("GET", "/v1/events", query=query)


class _Webhooks(_Resource):
    def create(self, url: str, events: Optional[list] = None) -> dict:
        """Returns the endpoint with its signing `secret` (shown once)."""
        return self._c.request("POST", "/v1/webhook-endpoints", {"url": url, **({"events": events} if events else {})})

    def list(self) -> dict:
        return self._c.request("GET", "/v1/webhook-endpoints")

    def remove(self, id: str) -> dict:
        return self._c.request("DELETE", f"/v1/webhook-endpoints/{_q(id)}")

    verify = staticmethod(verify_webhook)


class _Reports(_Resource):
    def sales(self, days: int = 30) -> dict:
        return self._c.request("GET", "/v1/reports/sales", query={"days": days})

    def tax(self, days: int = 365) -> dict:
        return self._c.request("GET", "/v1/reports/tax", query={"days": days})


class Commerce:
    """A store's API client. `api_key` defaults to the COMMERCEFORAI_API_KEY environment variable."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: float = 30.0, max_retries: int = 2):
        self.api_key = api_key or os.environ.get("COMMERCEFORAI_API_KEY")
        if not self.api_key:
            raise ValueError("No API key. Pass one, set COMMERCEFORAI_API_KEY, or call commerceforai.create_test_store() for a free test store.")
        self.base_url = (base_url or os.environ.get("COMMERCEFORAI_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout, self.max_retries = timeout, max_retries
        self.products, self.variants, self.inventory = _Products(self), _Variants(self), _Inventory(self)
        self.checkouts, self.orders, self.returns = _Checkouts(self), _Orders(self), _Returns(self)
        self.collections, self.discounts, self.customers = _Collections(self), _Discounts(self), _Customers(self)
        self.draft_orders, self.gift_cards, self.subscriptions = _DraftOrders(self), _GiftCards(self), _Subscriptions(self)
        self.approvals = _Approvals(self)
        self.store, self.events, self.webhooks, self.reports = _Store(self), _Events(self), _Webhooks(self), _Reports(self)

    def request(self, method: str, path: str, body: Any = None, query: Optional[Mapping[str, Any]] = None, idempotency_key: Optional[str] = None) -> Any:
        """Call any endpoint (see https://api.commerceforai.com/openapi.json). POSTs get an Idempotency-Key, so retries are safe."""
        qs = urllib.parse.urlencode({k: ("true" if v is True else "false" if v is False else v) for k, v in (query or {}).items() if v is not None})
        headers = {"authorization": f"Bearer {self.api_key}", "content-type": "application/json", "user-agent": f"commerceforai-python/{__version__}"}
        if method == "POST":
            headers["idempotency-key"] = idempotency_key or str(uuid.uuid4())
        if body is not None:
            body = {k: v for k, v in body.items() if v is not None} if isinstance(body, dict) else body
        return _send(method, f"{self.base_url}{path}{'?' + qs if qs else ''}", headers, body if method != "GET" else None, self.timeout, self.max_retries)
