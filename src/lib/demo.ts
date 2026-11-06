// Default on: the public build must never write unless explicitly switched off.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

// Public view-only account, printed on the login screen on purpose.
export const DEMO_ADMIN = { email: "admin@demo.com", password: "demo2026" };
export const DEMO_DISABLED_MESSAGE = "Action disabled in Demo Mode.";

// Sample accounts for the simulated Google chooser (example.com, so they can't belong to a real person).
export const DEMO_GOOGLE_ACCOUNTS = [
  // `photo` stands in for the Google profile photo: a 64 px PNG drawn for the demo, no request to Google.
  { name: "Alex Rivera", email: "alex.rivera@example.com", photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAwUlEQVR42u3YyRGDMBAF0R+bcyNXjj5wpkwC2IIZM4u6SgH0KxZppNeylV4CAAAAAAAAAAAAAOB0re+9HuCIPlvZAV/S/8TQ8/W+BoXUOxoUVe9lAGCodzEAABAMMNbbDbxCAACwE3cAlD+NdpgHOkxkHWbiJrcSXGwBmPcbqPobLXyUqD2RudQbDcpQbzEoQ7qFoVT1NwyTAR6ov2pQwvpLBuWsHzfMAQipHzQAyA8IrB8xAAAAoDcgvP6nofwT+ABav+GMxqZ5ngAAAABJRU5ErkJggg==" },
  { name: "Sam Okafor", email: "sam.okafor@example.com", photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAwklEQVR42u3YyRGDMBAF0Z+B0yM50vOBMwGYBLAFM2YWdZUC6Fcs0kivdSm9BAAAAAAAAAAAAADA6XrvWz3AEX22sgO+pP+JoefrfQ0KqXc0KKreywDAUO9iAAAgGGCstxt4hQAAYCfuACh/Gu0wD3SYyDrMxE1uJbjYAjDvN1D1N1r4KFF7InOpNxqUod5iUIZ0C0Op6m8YJgM8UH/VoIT1lwzKWT9umAMQUj9oAJAfEFg/YgAAAEBvQHj9T0P5J/ABeoB3KZcDp2YAAAAASUVORK5CYII=" },
];
