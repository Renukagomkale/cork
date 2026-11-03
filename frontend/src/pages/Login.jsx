import { useState } from "react";
import { ErrorList } from "../components/States.jsx";
import { errorMessages } from "../api";
import { useSession } from "../session.jsx";

export default function Login() {
  const { login, register } = useSession();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";
  const demoEmail = import.meta.env.VITE_DEMO_EMAIL;
  const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;

  const tryDemo = async () => {
    setBusy(true);
    setErrors([]);
    try {
      await login(demoEmail, demoPassword);
    } catch (error) {
      setErrors(errorMessages(error));
      setBusy(false);
    }
  };

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      await (registering ? register(form) : login(form.email, form.password));
    } catch (error) {
      setErrors(errorMessages(error));
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-xl border border-ink/30 bg-white px-3 py-2.5";

  return (
    <main
      className="grid h-full place-items-center px-4"
      style={{ backgroundImage: "radial-gradient(circle, rgb(35 38 43 / 0.22) 1.2px, transparent 1.3px)", backgroundSize: "28px 28px" }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm -rotate-1 space-y-4 rounded-[4px] bg-paper p-7 shadow-[0_18px_30px_-16px_rgb(35_38_43/0.55)]"
      >
        <p className="text-3xl font-bold tracking-tight">Cork</p>
        <p className="text-sm opacity-70">{registering ? "Make an account to start your first board." : "Sign in to open your boards."}</p>
        {registering && (
          <label className="block text-sm font-medium">
            Your name
            <input required value={form.name} onChange={set("name")} className={field} />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input type="email" required value={form.email} onChange={set("email")} className={field} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input type="password" required minLength={registering ? 8 : 1} value={form.password} onChange={set("password")} className={field} />
        </label>
        <ErrorList messages={errors} />
        <div className="flex items-center justify-between">
          <button disabled={busy} className="chip bg-cobalt text-paper hover:!bg-cobalt">
            {busy ? "One moment" : registering ? "Create account" : "Sign in"}
          </button>
          <button type="button" onClick={() => setMode(registering ? "login" : "register")} className="text-sm underline underline-offset-4">
            {registering ? "I have an account" : "Create an account"}
          </button>
        </div>
        {demoEmail && demoPassword && (
          <button type="button" onClick={tryDemo} disabled={busy} className="chip w-full justify-center bg-ink/10">
            Try the demo board
          </button>
        )}
      </form>
    </main>
  );
}
