package com.ex.orders

import jakarta.persistence.*

@Entity
@Table(name = "order_lines")
class OrderLine(
    @Id val id: Long,
    @ManyToOne @JoinColumn(name = "order_id") val order: Order,
    val sku: String,
)
