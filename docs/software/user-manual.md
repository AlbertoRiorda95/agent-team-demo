# Orders user manual

Written against: e025c2ffda74749627dd921c62b4f29fda9692c2 (2026-11-07)

For the shop's staff. Orders is the shop's back office: you find an order,
check it, and move it through its statuses. To install and start it, and to
get an account, see [install-and-operate.md](install-and-operate.md).

What the app does not do: it does not create or edit orders (they arrive from
the shop through the API), take payments, book shipments or manage accounts.
"Paid" and "shipped" are statuses you set by hand.

## Statuses

Every order is in one of four statuses, always shown as a badge with its name:

| Status | Meaning | Next statuses |
|---|---|---|
| New | The order has arrived | Paid, Cancelled |
| Paid | You marked it paid | Shipped, Cancelled |
| Shipped | You marked it shipped | none: final |
| Cancelled | You cancelled it | none: final |

There is no going back: a shipped or cancelled order stays that way.

## Log in

1. Open the app (locally http://localhost:5173). Without a session it shows
   **Log in**.
2. Enter your **Email** and **Password** and select **Log in**.
3. You land on the orders list, or on the page you had asked for before
   logging in.

What the messages mean:

| Message | What to do |
|---|---|
| Wrong email or password. | Check both and try again. A deactivated account gets the same message. |
| Too many attempts. Try again in N minutes. | 5 failed logins for an email within 15 minutes lock that email for 15 minutes. Wait, or ask the operator to set a new password. |
| Can't reach the service. | The server is down. Select **Retry** later. |

Your session ends after 8 hours without activity, and in any case 24 hours
after you logged in. The app then shows the login page and, after you log in,
takes you back to the page you were on.

## Log out

Select **Log out** in the top bar, on the right of your name. The session
ends on the server, so the browser's Back button does not reopen the app.

## Find an order

The orders list (**Orders** in the top bar) shows the newest orders first, 25
per page, with number, date, customer, status and total. On a narrow screen
(below 768 px) each order is a card instead of a table row.

- **Filter by status**: choose a status in **Status**; **All** shows every order.
- **Search**: type in **Search orders** part of an order number, a customer
  name or a customer email. Case does not matter. The results update shortly
  after you stop typing.
- **Pages**: use the pagination below the list. The line above the list says
  which orders you see out of how many.

Example: to find Anna's paid orders, choose **Paid** in **Status** and type
`anna` in **Search orders**.

The filter, the search and the page are part of the address in the browser:
you can bookmark a view or send it to a colleague, and Back returns to the
previous view.

| What you see | Meaning |
|---|---|
| No orders yet | The shop has no orders at all. |
| No orders match | Nothing matches the filter or the search. Select **Clear filters**. |
| Can't load the orders. | Loading failed. Select **Retry**. |

## Check an order

Select an order number in the list. The order page shows:

- the number, the status badge and the actions you can take now;
- **Customer**: name and email;
- **Shipping address**;
- **Items**: the lines with shipping and the total, in the order's currency;
- **History**: each status change, newest at the bottom, with the new status,
  who made it, when, the previous status and the cancellation reason if there
  is one.

Amounts are shown in the order's own currency, and dates and times in your
browser's language and time zone. The app never converts currencies.

**Back to orders** returns to the list as you left it (same filter, search
and page). An unknown number shows **Not found** with a link back to the list.

## Mark an order paid or shipped

1. Open the order.
2. Select **Mark paid** (on a new order) or **Mark shipped** (on a paid order).
3. A message confirms it, for example "Order ORD-000123 marked as paid". The
   badge and the history update at once, with your name.

Only the allowed actions are shown. A shipped or cancelled order shows "This
order is final: no more changes."

## Cancel an order

1. Open a new or paid order and select **Cancel**.
2. The dialog **Cancel order ORD-000123?** opens. Optionally type a
   **Reason** (at most 500 characters; the counter shows how many you used).
3. Select **Cancel order** to confirm, or **Keep order** to close the dialog
   without changes.

The reason appears in the history. Cancelling is final.

## When someone else changed the order

If a colleague changed the same order after you opened it, your change is not
applied and the page says "This order changed: reload." Select **Reload** to
see the order as it is now, then decide again. Nothing of theirs is
overwritten.

If the change fails for another reason, the page says "Couldn't change the
status." (or "Couldn't cancel the order. Try again." in the dialog): try again.

## Keyboard use

Everything works with the keyboard: Tab moves between fields, links and
buttons, Enter activates them. In the cancel dialog, focus stays inside the
dialog until you close it (Escape closes it too, like **Keep order**) and then returns to the **Cancel** button.
