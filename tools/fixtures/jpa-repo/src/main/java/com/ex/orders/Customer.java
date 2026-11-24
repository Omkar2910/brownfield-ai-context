package com.ex.orders;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "customers")
public class Customer extends BaseEntity {
    private String name;

    @Column(name = "email", length = 200)
    private String emailAddress;

    private Tier tier;          // no @Enumerated: JPA stores the position

    private Instant createdAt;

    public String getName() { return name; }
    public void rename(String n) { String local = n.trim(); this.name = local; }
}
