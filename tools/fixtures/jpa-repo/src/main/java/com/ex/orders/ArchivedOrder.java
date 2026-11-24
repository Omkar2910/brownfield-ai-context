package com.ex.orders;

import jakarta.persistence.*;

@Entity
@Table(name = "archived_orders")
public class ArchivedOrder { @Id private Long id; }
