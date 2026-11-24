package com.ex.orders;

/** Order lifecycle. */
public enum OrderStatus {
    NEW("n"),
    PAID("p") { @Override public boolean done() { return true; } },
    CANCELLED("c");

    private final String code;
    OrderStatus(String code) { this.code = code; }
    public boolean done() { return false; }
}
