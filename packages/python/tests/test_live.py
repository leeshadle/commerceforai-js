"""Runs against the real API with a throwaway test store (no credentials needed): python -m unittest discover -s tests"""
import base64, hashlib, hmac, json, time, unittest

from commerceforai import Commerce, CommerceError, create_test_store, verify_webhook


class LiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = create_test_store("Python SDK test")
        cls.commerce = Commerce(cls.store["api_key"])

    def test_sell_and_ship(self):
        c = self.commerce
        product = c.products.create(name="Trail Tee", variants=[{"name": "M", "price": 3600, "inventory": 5}, {"name": "L", "price": 3600, "inventory": 5}])
        m, l = (v["id"] for v in product["variants"])
        self.assertEqual(c.products.list(limit=10)["data"][0]["id"], product["id"])
        checkout = c.checkouts.create(items=[{"variant_id": m, "quantity": 1}], success_url="https://example.com/thanks")
        self.assertTrue(checkout["url"].startswith("https://checkout.stripe.com/"))
        order = c.store.simulate_order(items=[{"variant_id": m, "quantity": 2}])["order"]
        self.assertEqual(order["status"], "paid")
        preview = c.orders.edit(order["id"], replace=[{"variant_id": m, "with_variant_id": l, "quantity": 1}], dry_run=True)
        self.assertEqual(preview["refund"], 0)
        shipped = c.orders.fulfill(order["number"], carrier="USPS", tracking_number="PY123")
        self.assertEqual(shipped["status"], "fulfilled")
        self.assertIn("/track/", shipped["tracking_page_url"])
        self.assertTrue(any(e["type"] == "order.fulfilled" for e in c.events.list(type="order.*")["data"]))

    def test_errors_carry_details(self):
        with self.assertRaises(CommerceError) as ctx:
            self.commerce.products.create(nme="Typo", price=100)
        self.assertEqual(ctx.exception.type, "invalid_request")
        self.assertIn("name", ctx.exception.message)
        with self.assertRaises(CommerceError) as ctx:
            self.commerce.orders.get("ord_missing")
        self.assertEqual((ctx.exception.type, ctx.exception.status), ("not_found", 404))

    def test_verify_webhook(self):
        secret = "whsec_" + base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()
        body, ts = json.dumps({"type": "order.paid", "data": {"number": 1001}}), str(int(time.time()))
        sig = base64.b64encode(hmac.new(base64.b64decode(secret[6:]), f"msg_1.{ts}.{body}".encode(), hashlib.sha256).digest()).decode()
        headers = {"webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": f"v1,{sig}"}
        self.assertEqual(verify_webhook(body, headers, secret)["type"], "order.paid")
        with self.assertRaises(ValueError):
            verify_webhook(body + " ", headers, secret)
        with self.assertRaises(ValueError):
            verify_webhook(body, {**headers, "webhook-timestamp": "1"}, secret)


if __name__ == "__main__":
    unittest.main()
