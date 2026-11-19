package com.smartpgmanager.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    private volatile boolean webReady;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        long started = SystemClock.uptimeMillis();
        // Hide as soon as React mounts; the ceiling prevents a broken WebView
        // from trapping the activity permanently behind the system splash.
        splash.setKeepOnScreenCondition(() -> !webReady && SystemClock.uptimeMillis() - started < 10000);
        splash.setOnExitAnimationListener(provider -> provider.getView().animate().alpha(0f)
            .setDuration(160).withEndAction(provider::remove).start());
        registerPlugin(SmartPgNativePlugin.class);
        super.onCreate(savedInstanceState);
        setTheme(R.style.AppTheme_NoActionBar);
    }

    public void markWebReady() { webReady = true; }
}
