package id.bakorz.kanban.auth;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;

/** Injected boundary. Implementations must honor timeout and byte limits; results are public key data. */
@FunctionalInterface
public interface JwksTransport {
    byte[] fetch(URI trustedUri, Duration timeout, int maxBytes) throws IOException, InterruptedException;
}
