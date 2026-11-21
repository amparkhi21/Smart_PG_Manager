package com.smartpgmanager.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Small app-local Capacitor 8 bridge. No storage, contacts, or phone permissions. */
@CapacitorPlugin(name = "SmartPgNative")
public class SmartPgNativePlugin extends Plugin {
    private static final String KEY_ALIAS = "com.smartpgmanager.app.session.v1";
    private OnBackPressedCallback backCallback;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            backCallback = new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
                    if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                        WindowCompat.getInsetsController(getActivity().getWindow(), getBridge().getWebView())
                            .hide(WindowInsetsCompat.Type.ime());
                    } else if (hasListeners("backButton")) {
                        notifyListeners("backButton", new JSObject());
                    } else {
                        getActivity().moveTaskToBack(true);
                    }
                }
            };
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
        });
        clearOldExports();
    }

    @Override
    protected void handleOnResume() { notifyListeners("resume", new JSObject()); }

    @Override
    protected void handleOnDestroy() { if (backCallback != null) backCallback.remove(); }

    @PluginMethod
    public void ready(PluginCall call) {
        ((MainActivity) getActivity()).markWebReady();
        call.resolve();
    }

    @PluginMethod
    public void minimizeApp(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); });
    }

    private SharedPreferences vault() {
        return getContext().getSharedPreferences("smart_pg_session", Context.MODE_PRIVATE);
    }

    private synchronized SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            String encrypted = vault().getString("encrypted", null);
            String token = null;
            if (encrypted != null) {
                String[] parts = encrypted.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                cipher.updateAAD(KEY_ALIAS.getBytes(StandardCharsets.UTF_8));
                token = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            }
            JSObject result = new JSObject();
            result.put("token", token == null ? JSONObject.NULL : token);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("The saved session could not be unlocked. Retry, or sign out of the saved session to log in again.");
        }
    }

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty() || token.length() > 16384) { call.reject("Invalid session token"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            cipher.updateAAD(KEY_ALIAS.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
            if (!vault().edit().putString("encrypted", encrypted).commit()) throw new Exception();
            call.resolve();
        } catch (Exception exception) { call.reject("Could not securely save the session. Please try again."); }
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        if (vault().edit().clear().commit()) call.resolve();
        else call.reject("Could not clear the saved session");
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String filename = call.getString("filename", "");
        String mimeType = call.getString("mimeType", "");
        String encoded = call.getString("data", "");
        boolean pdf = "application/pdf".equals(mimeType) && filename.endsWith(".pdf");
        boolean csv = "text/csv".equals(mimeType) && filename.endsWith(".csv");
        if (!filename.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,119}") || (!pdf && !csv) || encoded.length() > 24 * 1024 * 1024) {
            call.reject("Unsupported export file"); return;
        }
        try {
            byte[] data = Base64.decode(encoded, Base64.DEFAULT);
            if (data.length > 16 * 1024 * 1024) throw new Exception();
            clearOldExports();
            File directory = new File(getContext().getCacheDir(), "exports/" + UUID.randomUUID());
            if (!directory.mkdirs()) throw new Exception();
            File file = new File(directory, filename);
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(data); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent share = new Intent(Intent.ACTION_SEND).setType(mimeType)
                .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_TITLE, filename);
            share.setClipData(ClipData.newUri(getContext().getContentResolver(), filename, uri));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try { getActivity().startActivity(Intent.createChooser(share, "Save or share " + filename)); call.resolve(); }
                catch (Exception exception) { call.reject("No app could share this file. Install a PDF viewer or file manager and try again."); }
            });
        } catch (Exception exception) { call.reject("Could not prepare the file for sharing. Try a smaller export."); }
    }

    private void clearOldExports() {
        File root = new File(getContext().getCacheDir(), "exports");
        File[] directories = root.listFiles();
        if (directories == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        for (File directory : directories) {
            if (!directory.isDirectory() || directory.lastModified() >= cutoff) continue;
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) if (file.isFile()) file.delete();
            directory.delete();
        }
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        String scheme = uri.getScheme();
        boolean upiPayment = "upi".equals(scheme) && "pay".equals(uri.getHost()) && uri.getPort() == -1 && uri.getFragment() == null &&
            (uri.getPath() == null || uri.getPath().isEmpty()) && "INR".equals(uri.getQueryParameter("cu")) &&
            uri.getQueryParameter("pa") != null && uri.getQueryParameter("pn") != null && uri.getQueryParameter("am") != null;
        if (!("https".equals(scheme) || "tel".equals(scheme) || "mailto".equals(scheme) || upiPayment) || uri.getUserInfo() != null ||
            ("https".equals(scheme) && (uri.getHost() == null || uri.getHost().isEmpty()))) {
            call.reject("Unsupported external link"); return;
        }
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); call.resolve(); }
            catch (Exception exception) { call.reject("No app could open this link"); }
        });
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("Smart PG Manager reminder", text));
            call.resolve();
        });
    }

    @PluginMethod
    public void getPushConfiguration(PluginCall call) {
        JSObject result = new JSObject();
        result.put("firebaseConfigured", BuildConfig.FCM_CLIENT_CONFIGURED);
        call.resolve(result);
    }
}
