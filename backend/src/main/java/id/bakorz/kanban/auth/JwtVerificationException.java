package id.bakorz.kanban.auth;

/** Safe categorical error. Never carries a token, network body, or parsing exception. */
public final class JwtVerificationException extends Exception {
    public enum Reason { INVALID_TOKEN, KEYS_UNAVAILABLE }
    private final Reason reason;

    public JwtVerificationException(Reason reason) {
        super(reason.name());
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
