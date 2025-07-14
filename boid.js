// —— Boid 类（已添加半径属性 r，用于碰撞检测） —— 
class Boid {
  constructor(x, y) {
    this.position     = createVector(x, y);
    this.velocity     = p5.Vector.random2D().setMag(random(2, 4));
    this.acceleration = createVector();
    this.maxForce     = 0.2;
    this.maxSpeed     = 3;
    this.reachedGoal  = false;
    this.r            = 12;    // ← 新增：Boid 半径，用于碰撞/收集判定
  }

  edges() {
    const bounce = -0.8;
    if (this.position.x < 0) {
      this.position.x = 0; this.velocity.x *= bounce;
    } else if (this.position.x > width) {
      this.position.x = width; this.velocity.x *= bounce;
    }
    if (this.position.y < navHeight) {
      this.position.y = navHeight; this.velocity.y *= bounce;
    } else if (this.position.y > height) {
      this.position.y = height; this.velocity.y *= bounce;
    }
  }

  align(boids) {
    let perception = 50, steering = createVector(), total = 0;
    for (let o of boids) {
      let d = p5.Vector.dist(this.position, o.position);
      if (o !== this && d < perception) {
        steering.add(o.velocity); total++;
      }
    }
    if (total > 0) {
      steering.div(total)
              .setMag(this.maxSpeed)
              .sub(this.velocity)
              .limit(this.maxForce);
    }
    return steering;
  }

  cohesion(boids) {
    let perception = 50, steering = createVector(), total = 0;
    for (let o of boids) {
      let d = p5.Vector.dist(this.position, o.position);
      if (o !== this && d < perception) {
        steering.add(o.position); total++;
      }
    }
    if (total > 0) {
      steering.div(total)
              .sub(this.position)
              .setMag(this.maxSpeed)
              .sub(this.velocity)
              .limit(this.maxForce);
    }
    return steering;
  }

  separation(boids) {
    let perception = 30, steering = createVector(), total = 0;
    for (let o of boids) {
      let d = p5.Vector.dist(this.position, o.position);
      if (o !== this && d < perception) {
        let diff = p5.Vector.sub(this.position, o.position).div(d * d);
        steering.add(diff); total++;
      }
    }
    if (total > 0) {
      steering.div(total)
              .setMag(this.maxSpeed)
              .sub(this.velocity)
              .limit(this.maxForce);
    }
    return steering;
  }

  flock(boids) {
    this.acceleration
        .add(this.align(boids).mult(1))
        .add(this.cohesion(boids).mult(1))
        .add(this.separation(boids).mult(1.5));
  }

  attract(mx, my) {
    let m = createVector(mx, my),
        force = p5.Vector.sub(m, this.position),
        d = force.mag();
    force.normalize().mult(map(d, 0, width, 0.5, 0));
    this.acceleration.add(force);
  }
  
    // —— 添加 applyForce 方法 —— 
  applyForce(force) {
    // 原本 flock/attract 都是直接加到 acceleration
    this.acceleration.add(force);
  }

  update() {
    this.velocity.add(this.acceleration).limit(this.maxSpeed);
    this.position.add(this.velocity);
    this.acceleration.mult(0);
  }

  show(fn) {
    if (fn) {
      fn(this.position.x, this.position.y, this.velocity.heading());
    } else {
      push();
      translate(this.position.x, this.position.y);
      rotate(this.velocity.heading());
      fill(255, 220, 0);
      stroke(60, 50, 0);
      strokeWeight(1);
      beginShape();
      vertex( this.r,  0);
      vertex(-this.r * 0.8,  this.r * 0.5);
      vertex(-this.r * 0.6,  0);
      vertex(-this.r * 0.8, -this.r * 0.5);
      endShape(CLOSE);
      pop();
    }
  }



// —— 在这里粘入 followPath 方法 —— 
    followPath(path) {
    // 如果 path 不存在或长度小于 2，什么都不做
    if (!path || path.length < 2) return;

    let closestD = Infinity;
    let closestT = createVector(0, 0);
    for (let i = 0; i < path.length - 1; i++) {
      let A  = createVector(path[i].x,   path[i].y);
      let B  = createVector(path[i+1].x, path[i+1].y);
      let AB = p5.Vector.sub(B, A);
      // 计算投影系数 t
      let t = constrain(
        p5.Vector.sub(this.position, A).dot(AB) / AB.magSq(),
        0, 1
      );
      let Q = p5.Vector.add(A, p5.Vector.mult(AB, t));
      let d = p5.Vector.dist(this.position, Q);
      if (d < closestD) {
        closestD = d;
        closestT = AB.copy().normalize();
      }
    }
    if (closestD < PATH_INFLUENCE_RADIUS) {
      let w = (PATH_INFLUENCE_RADIUS - closestD) / PATH_INFLUENCE_RADIUS;
      let F = closestT.mult(PATH_STRENGTH * w);
      this.applyForce(F);
    }
  }

}


