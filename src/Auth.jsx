import { useState } from "react";
import { supabase } from "./supabaseClient";
import { useI18n } from "./i18n";

export default function Auth() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleAuth = async () => {
    setMessage("");
    setError("");
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMessage(t("auth.login_success"));
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage(t("auth.signup_success"));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="auth-container">
      <h2>{isLogin ? t("auth.login") : t("auth.signup")}</h2>

      <input
        type="email"
        placeholder={t("auth.email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder={t("auth.password")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={handleAuth}>
        {isLogin ? t("auth.login") : t("auth.create_account")}
      </button>

      <p>
        {isLogin ? t("auth.no_account") : t("auth.have_account")}{" "}
        <span
          className="link"
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage("");
            setError("");
          }}
        >
          {isLogin ? t("auth.signup") : t("auth.login")}
        </span>
      </p>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
