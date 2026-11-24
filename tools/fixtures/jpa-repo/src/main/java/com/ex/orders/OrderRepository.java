package com.ex.orders;

import org.springframework.data.jpa.repository.*;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, Long> {
    @Query(value = "select * from orders where status = 'NEW'", nativeQuery = true)
    List<Order> findNew();
}
