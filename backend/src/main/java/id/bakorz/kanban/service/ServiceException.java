package id.bakorz.kanban.service;

/** Safe domain failure. Messages are fixed English text, never SQL or user input. */
public final class ServiceException extends Exception {
    private final int status;
    private final String code;

    public ServiceException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    public int status() { return status; }
    public String code() { return code; }

    public static ServiceException notFound() { return new ServiceException(404, "NOT_FOUND", "Not found."); }
    public static ServiceException unavailable() { return new ServiceException(503, "UNAVAILABLE", "The service is temporarily unavailable."); }
    public static ServiceException invalid(String message) { return new ServiceException(400, "VALIDATION_ERROR", message); }
}
