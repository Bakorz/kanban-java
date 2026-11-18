package id.bakorz.kanban.auth;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Fixed-target HTTP fetch with no redirects and a whole-response deadline, including body reads. */
public final class HttpJwksTransport implements JwksTransport, AutoCloseable {
    private final HttpClient client;
    private final boolean loopbackTestOnly;

    public HttpJwksTransport() { this(false); }

    // Package-private test seam. Production constructors can never enable HTTP.
    HttpJwksTransport(boolean loopbackTestOnly) {
        this.loopbackTestOnly = loopbackTestOnly;
        client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(3)).build();
    }

    @Override
    public byte[] fetch(URI uri, Duration timeout, int maxBytes) throws IOException, InterruptedException {
        if (!(loopbackTestOnly && "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
                && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null)) {
            JwtVerificationConfig.requireHttps(uri);
        }
        if (maxBytes < 1 || timeout.isNegative() || timeout.isZero()) throw new IllegalArgumentException("Invalid fetch limits");
        var request = HttpRequest.newBuilder(uri).timeout(timeout).header("Accept", "application/json").GET().build();
        var future = client.sendAsync(request, info -> new LimitedBody(maxBytes));
        try {
            var response = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() != 200) throw new IOException("JWKS HTTP failure");
            return response.body();
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new IOException("JWKS request deadline exceeded");
        } catch (ExecutionException exception) {
            future.cancel(true);
            throw new IOException("JWKS request failed");
        } catch (InterruptedException exception) {
            future.cancel(true);
            throw exception;
        }
    }

    @Override
    public void close() { client.close(); }

    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final int maximum;
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private Flow.Subscription subscription;

        LimitedBody(int maximum) { this.maximum = maximum; }
        @Override public CompletableFuture<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (var buffer : buffers) {
                if (buffer.remaining() > maximum - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new IOException("JWKS response exceeds limit"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable throwable) { result.completeExceptionally(new IOException("JWKS body failed")); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
