package com.ex.orders;

import jakarta.persistence.*;
import java.util.List;

@Entity
@Table(name = "orders", indexes = { @Index(name = "ix_status", columnList = "status") })
public class Order {
    @Id
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderStatus status;

    @Column(name = "discount_code")
    private String discount;    // the column is not in the schema export

    @OneToMany(mappedBy = "order")
    private List<OrderLine> lines;

    @Transient
    private String cache;

    private static final long serialVersionUID = 1L;

    public boolean isOpen() { return status == OrderStatus.NEW; }
}
