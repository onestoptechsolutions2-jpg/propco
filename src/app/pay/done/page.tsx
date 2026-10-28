/** Where Flutterwave sends the customer after checkout. Public; shows nothing about the payment itself. */
export default function PaymentDonePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-serif text-3xl text-ink">Thank you</h1>
      <p className="text-sm text-muted">
        If your payment went through, it will show on your account within a minute or two. You&apos;ll get a receipt by message.
      </p>
    </main>
  );
}
