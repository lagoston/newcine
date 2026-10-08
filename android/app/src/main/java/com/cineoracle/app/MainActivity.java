package com.cineoracle.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

// Tela única do app: o CineOracle (o site empacotado) numa WebView.
// EdgeToEdge: o app desenha atrás das barras do sistema e o site cuida das
// margens com env(safe-area-inset-*) — o mesmo CSS que já funciona no
// iPhone. (Capacitor: SystemBars.insetsHandling = "native".)
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
