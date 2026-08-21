package com.volthome.core.repository;

import com.volthome.core.model.jpa.Home;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HomeRepository extends JpaRepository<Home, Long> {
    List<Home> findByUserUsername(String username);
}
