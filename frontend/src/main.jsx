import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { PushNotificationsProvider } from './context/PushNotificationsContext.jsx';
import { isAndroid } from './native/platform.js';
import NativeRuntime from './components/NativeRuntime.jsx';
import ConnectionNotice from './components/ConnectionNotice.jsx';
import './index.css';

if (isAndroid) document.documentElement.classList.add('native-android');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NativeRuntime />
      <ConnectionNotice />
      <AuthProvider>
        <PushNotificationsProvider>
          <App />
          <Toaster position="top-center" toastOptions={{ style: { borderRadius: '12px', fontSize: '14px' } }} />
        </PushNotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
