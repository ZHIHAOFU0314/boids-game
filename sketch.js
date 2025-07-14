// ✅ sketch.js - 自由探索模式（新增可收集道具功能，修正路径执行 & 路径带宽） 

let boids = [];
const navHeight = 0;
let attractMode = false;
let obstacles = [];
let explosions = [];
let bubbles = [];
let showRetry = false;
let hasStarted = false;
let scrollOffset = 0;
let scrollSpeed = 2;
let obstacleSpacing = 400;

// —— 新增 可收集道具状态 —— 
let collectibles = [];
let collectCount = 0;
let flashEffects = []; // 收集闪光效果

// —— 全局绘线状态 —— 
let drawPathMode  = false;
let isDrawingPath = false;
let currentPath   = [];
let pathQueue     = [];

// —— 新增 路径带宽常量 —— 
const PATH_WIDTH = 20;

let pathBtn;

function setup() {
  createCanvas(windowWidth, windowHeight);
  initBoids();
  generateObstacles();
  generateBubbles();
  generateCollectibles(); // 初始化道具
  windowResized();

  pathBtn = createButton('绘制路径');
  pathBtn.position(20, 20);
  pathBtn.style('padding', '6px 12px');
  pathBtn.style('background', '#fff');
  pathBtn.mousePressed(() => {
    drawPathMode = !drawPathMode;
    pathBtn.style('background', drawPathMode ? '#ccc' : '#fff');
    if (!drawPathMode) {
      isDrawingPath = false;
      currentPath   = [];
      pathQueue     = [];
      attractMode   = false;
    }
  });
}

function initBoids() {
  boids = [];
  for (let i = 0; i < 100; i++) {
    boids.push(new Boid(random(width / 4), random(height)));
  }
  attractMode = false;
  showRetry = false;
  hasStarted = false;
  scrollOffset = 0;
  collectCount = 0;        // 重置计数
  collectibles = [];
  flashEffects = [];
  generateObstacles();
  generateCollectibles();
}

function generateObstacles() {
  obstacles = [];
  for (let i = 0; i < 20; i++) {
    let ox = width + i * obstacleSpacing;
    let oy = random(100, height - 100);
    let r = random(30, 60);
    obstacles.push(generateRockShape(ox, oy, r));
  }
}

function generateBubbles() {
  bubbles = [];
  for (let i = 0; i < 50; i++) {
    bubbles.push({
      x: random(width),
      y: random(height),
      r: random(3, 8),
      alpha: random(100, 200),
      speed: random(0.5, 1.5),
    });
  }
}

function generateCollectibles() {
  // 在初始屏幕内生成 10 个道具
  for (let i = 0; i < 10; i++) {
    let cx = random(width, width * 2);
    let cy = random(100, height - 100);
    collectibles.push({ x: cx, y: cy, r: 12 });
  }
}

function generateRockShape(x, y, r) {
  let angles = [];
  for (let a = 0; a < TWO_PI; a += random(PI / 6, PI / 3)) {
    angles.push(a);
  }
  return { x, y, r, angles };
}

function drawOceanGradient() {
  for (let y = 0; y < height; y++) {
    let inter = map(y, 0, height, 0, 1);
    let c = lerpColor(color(0, 150, 200), color(0, 30, 60), inter);
    stroke(c);
    line(0, y, width, y);
  }
}

function draw() {
  drawOceanGradient();

  if (hasStarted) {
    scrollOffset += scrollSpeed;
    if (scrollOffset % obstacleSpacing < scrollSpeed) {
      let ox = scrollOffset + width + 200;
      let oy = random(100, height - 100);
      let r = random(30, 60);
      obstacles.push(generateRockShape(ox, oy, r));
      // 生成新的道具
      let cx = scrollOffset + width + random(200, 600);
      let cy = random(100, height - 100);
      collectibles.push({ x: cx, y: cy, r: 12 });
    }
  }

  // 渲染气泡
  noStroke();
  for (let b of bubbles) {
    fill(255, 255, 255, b.alpha);
    ellipse(b.x, b.y, b.r);
    b.y -= b.speed;
    b.alpha += random(-2, 2);
    if (b.y < -10) {
      b.y = height + random(20);
      b.x = random(width);
    }
  }

  // 渲染爆炸
  for (let i = explosions.length - 1; i >= 0; i--) {
    let ex = explosions[i];
    fill(255, 150, 0, ex.alpha);
    ellipse(ex.x, ex.y, ex.size);
    ex.size += 1.5;
    ex.alpha -= 6;
    if (ex.alpha <= 0) explosions.splice(i, 1);
  }

  drawHealthBar();

  // 渲染障碍物
  for (let obs of obstacles) {
    let screenX = obs.x - scrollOffset;
    if (screenX > -150 && screenX < width + 150) {
      push();
      translate(screenX, obs.y);
      fill(100, 80, 60, 200);
      stroke(40);
      strokeWeight(1);
      beginShape();
      for (let a of obs.angles) {
        let vx = cos(a) * obs.r;
        let vy = sin(a) * obs.r;
        vertex(vx, vy);
      }
      endShape(CLOSE);
      pop();
    }
  }

  // 渲染道具
  for (let i = collectibles.length - 1; i >= 0; i--) {
    let c = collectibles[i];
    let sx = c.x - scrollOffset;
    if (sx > -20 && sx < width + 20) {
      fill(255, 223, 0);
      noStroke();
      ellipse(sx, c.y, c.r * 2);
    }
  }

  // 检测收集
  for (let i = collectibles.length - 1; i >= 0; i--) {
    let c = collectibles[i];
    let sx = c.x - scrollOffset;
    for (let b of boids) {
      if (dist(b.position.x, b.position.y, sx, c.y) < b.r + c.r) {
        // 触发闪光效果
        flashEffects.push({ x: sx, y: c.y, t: millis() });
        collectibles.splice(i, 1);
        collectCount++;
        break;
      }
    }
  }

  // 渲染闪光效果
  for (let i = flashEffects.length - 1; i >= 0; i--) {
    let f = flashEffects[i];
    let elapsed = millis() - f.t;
    if (elapsed > 300) {
      flashEffects.splice(i, 1);
      continue;
    }
    let alpha = map(elapsed, 0, 300, 255, 0);
    let rad = map(elapsed, 0, 300, 8, 32);
    noFill();
    stroke(255, 255, 0, alpha);
    strokeWeight(2);
    ellipse(f.x, f.y, rad * 2);
  }

  // 高亮 & 淡化路径
  drawingContext.setLineDash([12, 8]);
  for (let path of pathQueue) {
    for (let i = 0; i < path.length - 1; i++) {
      let alpha = map(i, 0, path.length - 1, 255, 50);
      stroke(255, alpha);
      strokeWeight(PATH_WIDTH);
      let p1 = path[i], p2 = path[i + 1];
      line(p1.x, p1.y, p2.x, p2.y);
    }
  }
  drawingContext.setLineDash([]);

  if (isDrawingPath && currentPath.length > 1) {
    noFill();
    stroke(255, 200);
    strokeWeight(PATH_WIDTH);
    drawingContext.setLineDash([12, 8]);
    beginShape();
    for (let p of currentPath) vertex(p.x, p.y);
    endShape();
    drawingContext.setLineDash([]);
  }

  // —— 路径执行：按状态机分支执行 —— 
  if (pathQueue.length) {
    let path = pathQueue[0];

    // 1. 检测是否已聚集到起点
    let startPt = createVector(path[0].x, path[0].y);
    let arriveThreshold = PATH_WIDTH/2 + 20;
    let atStart = boids.every(b =>
      p5.Vector.dist(b.position, startPt) < arriveThreshold
    );

    if (!atStart) {
      // 未聚集：吸附到起点
      boids.forEach(b => {
        b.attract(startPt.x, startPt.y);
        b.update();
        b.velocity.limit(b.maxSpeed);
      });
    } else {
      // 已聚集：吸附到下一个点
      let nextIdx = path.length > 1 ? 1 : 0;
      let nextPt = createVector(path[nextIdx].x, path[nextIdx].y);
      boids.forEach(b => {
        b.attract(nextPt.x, nextPt.y);
        b.update();
        b.velocity.limit(b.maxSpeed);
      });
      // 若已到下一个点，则移除该点
      let atNext = boids.every(b =>
        p5.Vector.dist(b.position, nextPt) < arriveThreshold
      );
      if (atNext) {
        path.shift();
        if (path.length === 0) pathQueue.shift();
      }
    }

    // 碰撞检测
    for (let i = boids.length - 1; i >= 0; i--) {
      let b = boids[i];
      for (let obs of obstacles) {
        let sx = obs.x - scrollOffset;
        if (dist(b.position.x, b.position.y, sx, obs.y) < obs.r) {
          explosions.push({ x: b.position.x, y: b.position.y, size: 2, alpha: 255 });
          boids.splice(i, 1);
          break;
        }
      }
    }

    boids.forEach(b => {
      b.edges();
      b.show();
    });

  } else {
    // 原有避障/吸附/群体 & 收集逻辑
    if (!showRetry) {
      for (let i = boids.length - 1; i >= 0; i--) {
        let boid = boids[i];
        if (!attractMode) {
          for (let obs of obstacles) {
            let sx = obs.x - scrollOffset;
            let avoid = p5.Vector.sub(boid.position, createVector(sx, obs.y));
            let d = avoid.mag();
            if (d < obs.r + 40) {
              avoid.setMag(1.5 * (1 - d / (obs.r + 40)));
              boid.velocity.add(avoid);
            }
          }
        } else {
          for (let obs of obstacles) {
            let sx = obs.x - scrollOffset;
            if (dist(boid.position.x, boid.position.y, sx, obs.y) < obs.r) {
              explosions.push({ x: boid.position.x, y: boid.position.y, size: 2, alpha: 255 });
              boids.splice(i, 1);
              break;
            }
          }
        }
        if (boids[i]) {
          boids[i].edges();
          boids[i].flock(boids);
          if (attractMode) boids[i].attract(mouseX, mouseY);
          boids[i].update();
          boids[i].show();
        }
      }
      if (boids.length === 0) {
        showRetry = true;
        if (drawPathMode) {
          drawPathMode = false;
          pathBtn.style('background', '#fff');
        }
      }
    } else {
      drawRetryScreen();
    }
  }
}

function drawHealthBar() {
  let barW = 300, barH = 20, barX = width/2, barY = 30;
  let curr = boids.length, tot = 100, ratio = curr / tot;
  let shakeX = ratio < 0.3 ? random(-1.5,1.5) : 0;
  let shakeY = ratio < 0.3 ? random(-1.5,1.5) : 0;
  let barCol = color(0,220,100);
  if (ratio < 0.6) barCol = color(255,165,0);
  if (ratio < 0.3) barCol = (frameCount%20<10?color(255,60,60):color(120,0,0));
  rectMode(CENTER);
  fill(50,50,50,200); stroke(80); strokeWeight(2);
  rect(barX+shakeX, barY+shakeY, barW, barH, 10);
  noStroke(); fill(barCol);
  rect(barX+shakeX, barY+shakeY, barW*ratio, barH, 10);
  fill(255); textSize(14); textAlign(CENTER, CENTER);
  text(`${curr} / ${tot}`, barX+shakeX, barY+shakeY);
  // 渲染道具计数
  noStroke(); fill(255, 223, 0);
  textSize(14); textAlign(LEFT, CENTER);
  text(`道具: ${collectCount}`, barX + barW/2 + 20, barY+shakeY);
}

function drawRetryScreen() {
  drawOceanGradient();
  for (let b of bubbles) {
    fill(255,255,255,b.alpha);
    ellipse(b.x,b.y,b.r);
  }
  textAlign(CENTER, CENTER);
  fill(255); noStroke(); textSize(36);
  text("All Boids Lost", width/2, height/2-60);
  textSize(20); rectMode(CENTER); fill(200);
  rect(width/2, height/2, 140, 40, 10); fill(50);
  text("Try Again", width/2, height/2);
  fill(200); rect(width/2, height/2+60, 140, 40, 10); fill(50);
  text("Exit", width/2, height/2+60);
}

function mousePressed() {
  if (drawPathMode) {
    isDrawingPath = true;
    currentPath   = [{ x: mouseX, y: mouseY }];
    return;
  }
  if (showRetry) {
    if (mouseX > width/2-70 && mouseX < width/2+70 && mouseY > height/2-20 && mouseY < height/2+20) {
      initBoids();
    } else if (mouseX > width/2-70 && mouseX < width/2+70 && mouseY > height/2+40 && mouseY < height/2+80) {
      window.location.href = "main.html";
    }
  } else {
    if (!hasStarted) hasStarted = true;
    attractMode = !attractMode;
  }
}

function mouseDragged() {
  if (drawPathMode && isDrawingPath) currentPath.push({ x: mouseX, y: mouseY });
}

function mouseReleased() {
  if (drawPathMode && isDrawingPath) {
    isDrawingPath = false;
    if (currentPath.length > 1) {
      pathQueue = [ currentPath.slice() ];
    }
    currentPath = [];
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
