import React from "react";
import { AuthProvider } from "../context/AuthContext";
import { DatabaseProvider } from "../context/DatabaseContext";
import { NotificationProvider } from "../context/NotificationContext";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <DatabaseProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </DatabaseProvider>
  </AuthProvider>
);
