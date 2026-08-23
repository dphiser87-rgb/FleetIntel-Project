import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const CurrencyContext = createContext({ currency: "USD", setCurrency: () => {} });

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState("USD");

  useEffect(() => {
    api.get("/users/me/prefs").then((r) => {
      if (r.data?.currency) setCurrencyState(r.data.currency);
    }).catch(() => {});
  }, []);

  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    api.put("/users/me/prefs", { currency: code }).catch(() => {});
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
