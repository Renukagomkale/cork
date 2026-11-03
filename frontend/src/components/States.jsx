import { errorMessages } from "../api";

export function Loading({ label = "Loading" }) {
  return <p className="grid h-full min-h-[50vh] place-items-center text-lg font-medium">{label}...</p>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="rounded-2xl bg-paper p-5 shadow-[0_6px_16px_-10px_rgb(35_38_43/0.5)]" role="alert">
      <p className="font-medium">{errorMessages(error)[0]}</p>
      {onRetry && (
        <button onClick={onRetry} className="chip mt-3 bg-ink/10">
          Try again
        </button>
      )}
    </div>
  );
}

export function ErrorList({ messages }) {
  if (!messages.length) return null;
  return (
    <ul className="rounded-xl bg-sunflower/40 px-4 py-3 text-sm" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
