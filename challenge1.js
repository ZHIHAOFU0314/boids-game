

// 在文件顶部新增：
function handleGoalZone() {
  let elapsed = (millis() - startTime) / 1000;
  if (elapsed >= goalComingTime && !goalZone) {
    goalZone = { x: width + 100, y: height / 2, r: 60, arrived: false };
  }
  if (goalZone && !goalZone.arrived) {
    goalZone.x = lerp(goalZone.x, width - 150, 0.02);
    if (abs(goalZone.x - (width - 150)) < 1) {
      goalZone.arrived = true;
    }
  }
}


// 存储单关记录到 localStorage.tmpRecord
function saveLevelRecord(level) {
  const timeTaken  = ((millis() - startTime) / 1000).toFixed(2);
  const aliveCount = boids.length;
  const rec = {
    level,
    time:      parseFloat(timeTaken),
    alive:     aliveCount,
    collected: collectCount,
    retries:   retryCount    // 新增这一项
  };
  const tmp = JSON.parse(localStorage.getItem('tmpRecord') || '[]');
  tmp.push(rec);
  localStorage.setItem('tmpRecord', JSON.stringify(tmp));
  retryCount = 0;  // 重置，为下关准备
}




// ✅ challenge1.js - 第一关：候鸟南飞 最终完整实现（已加入暂停菜单功能）

// 在文件最顶端，已有 let collectCount = 0; 这一行附近，新增：
let retryCount = 0;  // 本关重试次数
// —— 流场吸引参数 —— 
const PATH_INFLUENCE_RADIUS = 100;  // 影响半径（像素）
const PATH_STRENGTH         = 0.3;  // 吸引强度


let boids = [];
let attractMode = false;
let obstacles = [];
let explosions = [];
let bubbles = [];
let showResult = false;
let hasStarted = false;
let isPaused    = false;   // 当前是否在暂停状态
let showPauseUI = false;   // 是否需要画出暂停时的半透明遮罩和菜单框

let pauseStart = 0;


let scrollOffset = 0;
let scrollSpeed = 2;
let obstacleSpacing = 400;
let totalBoids = 100;
const navHeight = 100; // 顶部导航栏的高度

let maxTime = 30;
let startTime = 0;
let resultText = "";
let levelPassed = false;

let goalZone = null;
let goalComingTime = 20;

// —— 手绘路径 & 道具状态 —— 
let drawPathMode  = false;
let isDrawingPath = false;
let currentPath   = [];
let pathQueue     = [];
const PATH_WIDTH  = 20;     // 路径线宽
let collectibles  = [];     // 可收集道具
let collectCount  = 0;      // 道具计数
let flashEffects  = [];     // 闪光效果
let pathBtn;                // 绘制路径按钮

function setup() {
  createCanvas(windowWidth, windowHeight);
  initBoids();
  generateObstacles();
  generateBubbles();
    // —— 手绘路径开关按钮 —— 
//pathBtn = createButton('绘制路径');
//pathBtn.position(80, 36);
//pathBtn.style('padding','4px 10px');
//pathBtn.style('background','#fff');
//pathBtn.mousePressed(() => {
  //drawPathMode = !drawPathMode;
  //pathBtn.style('background', drawPathMode ? '#ccc' : '#fff');
  // 退出绘制时清空状态
  //if (!drawPathMode) {
    //isDrawingPath = false;
   // currentPath   = [];
    //pathQueue     = [];
  //}
//});
   // generateCollectibles();        // 初始化道具
  // —— 手绘路径开关按钮 —— 
pathBtn = createButton('Drawing paths');
pathBtn.style('padding','4px 10px');
pathBtn.style('background','#fff');
pathBtn.mousePressed(() => {
  drawPathMode = !drawPathMode;
  pathBtn.style('background', drawPathMode ? '#ccc' : '#fff');
  if (!drawPathMode) {
    isDrawingPath = false;
    currentPath   = [];
    pathQueue     = [];
  }
});

}

function draw() {
    // ① Reset the _raw_ Canvas2D context transform:
  drawingContext.resetTransform();
  // ② Reset p5’s own matrix stack:
  resetMatrix();

  // —— 0. 根据是否在结果页，隐藏/显示“绘制路径”按钮 —— 
  if (showResult) {
    pathBtn.hide();
  } else {
    pathBtn.show();
  }
  // —— 0. 如果在暂停态，只渲染当前帧，不更新任何状态 —— 
  if (showPauseUI) {
    // 再次保证无任何变换
    drawingContext.resetTransform();
    resetMatrix();

    // 0.1 背景与静态元素（保持上一帧样子）
    drawSkyGradient();
    drawClouds();
    drawObstacles();
    drawExplosions();
    renderCollectibles();
    renderFlash();

    // 0.2 路径 UI（如果有也渲染）
    drawingContext.setLineDash([12, 8]);
    stroke(255); strokeWeight(PATH_WIDTH); noFill();
    for (let path of pathQueue) {
      for (let i = 0; i < path.length - 1; i++) {
        let a = map(i, 0, path.length - 1, 255, 50);
        stroke(255, a);
        let p1 = path[i], p2 = path[i + 1];
        line(p1.x, p1.y, p2.x, p2.y);
      }
    }
    drawingContext.setLineDash([]);

    // 0.3 Boids （不调用 update/follow，纯渲染）
    boids.forEach(b => {
      b.show(drawMigratingBird);
    });

    // 0.4 顶栏 + 暂停菜单
    drawTopBar();
    drawPauseScreen();
    return;
  }

  // —— 1. 正常运行态 —— 

  handleGoalZone();

  // 背景 & 世界静态部分
  drawSkyGradient();
  drawClouds();

  // 滚动与生成障碍（这些属于“更新”，只在非暂停时执行）
  scrollOffset += scrollSpeed;
  if (scrollOffset % obstacleSpacing < scrollSpeed) {
    let ox = scrollOffset + width + 200;
    if (random() < 0.5) {
      let peakH = random(200, 350), baseW = width / 5;
      obstacles.push({
        type: 'mountain',
        x: ox,
        peakHeight: peakH,
        baseWidth: baseW,
        avoidRadius: peakH * 0.8
      });
    } else {
      let towerH = random(150, 300), bladeL = random(40, 60);
      obstacles.push({
        type: 'turbine',
        x: ox,
        towerHeight: towerH,
        bladeLength: bladeL,
        angle: random(TWO_PI),
        avoidRadius: bladeL + 20
      });
    }
  }
  //if (frameCount % 120 === 0) generateObstacles();

  // 渲染静态
  drawObstacles();
  drawExplosions();

  // 道具 & 闪光
  renderCollectibles();
  renderFlash();

  // 手绘路径 UI
  drawingContext.setLineDash([12, 8]);
  stroke(255); strokeWeight(PATH_WIDTH); noFill();
  for (let path of pathQueue) {
    for (let i = 0; i < path.length - 1; i++) {
      let a = map(i, 0, path.length - 1, 255, 50);
      stroke(255, a);
      let p1 = path[i], p2 = path[i + 1];
      line(p1.x, p1.y, p2.x, p2.y);
    }
  }
  drawingContext.setLineDash([]);
  if (isDrawingPath && currentPath.length > 1) {
    drawingContext.setLineDash([12, 8]);
    stroke(255, 200); strokeWeight(PATH_WIDTH);
    beginShape();
      currentPath.forEach(p => vertex(p.x, p.y));
    endShape();
    drawingContext.setLineDash([]);
  }

  // Boids 行为分支
  if (pathQueue.length > 0) {
    runPathGuidance();
  } else {
    runOriginalLogic();
  }

  // 顶栏 & 面板
  drawTopBar();
  if (showResult) {
    drawResultScreen();
  }
}




function updateWorld() {
  // —— 终点出现逻辑 —— 
  let elapsed = (millis() - startTime) / 1000;
  if (elapsed >= goalComingTime && !goalZone) {
    goalZone = { x: width + 100, y: height / 2, r: 60, arrived: false };
  }
  if (goalZone && !goalZone.arrived) {
    goalZone.x = lerp(goalZone.x, width - 150, 0.02);
    if (abs(goalZone.x - (width - 150)) < 1) {
      goalZone.arrived = true;
    }
  }
  if (goalZone) drawGoal();

  // —— 滚动 & 生成障碍 —— 
  scrollOffset += scrollSpeed;
  if (scrollOffset % obstacleSpacing < scrollSpeed) {
    let ox = scrollOffset + width + 200;
    if (random() < 0.5) {
      // 山峰
      let peakH = random(200, 350),
          baseW = width / 5;
      obstacles.push({
        type: 'mountain',
        x: ox,
        peakHeight: peakH,
        baseWidth: baseW,
        avoidRadius: peakH * 0.8
      });
    } else {
      // 风车
      let towerH = random(150, 300),
          bladeL = random(40, 60);
      obstacles.push({
        type: 'turbine',
        x: ox,
        towerHeight: towerH,
        bladeLength: bladeL,
        angle: random(TWO_PI),
        avoidRadius: bladeL + 20
      });
    }
  }

  // —— 气泡、障碍、爆炸、群体更新 & 判定 —— 
  drawClouds();
  drawObstacles();
  drawExplosions();

  if (!showResult) {
    updateBoids();
    checkGameState();
  }
}




function initBoids() {
  boids = [];
  for (let i = 0; i < totalBoids; i++) {
    boids.push(new Boid(random(width / 4), random(height)));
  }
  attractMode    = false;
  showResult     = false;
  hasStarted     = true;
  isPaused       = false;
  showPauseUI    = false;
  scrollOffset   = 0;
  resultText     = "";
  levelPassed    = false;
  goalZone       = null;

  // —— 新增：重置道具相关状态 —— 
  collectCount   = 0;
  collectibles   = [];
  flashEffects   = [];
  generateCollectibles();

  generateObstacles();
  generateBubbles();
  startTime      = millis();
}


function drawTopBar() {
  push();
    resetMatrix();
     // —— 把“绘制路径”按钮放到血条左侧 —— 
    // 假设 drawHealthBar 里血条宽度是 200px，高度 18px，
    // 它的中心在 (width/2, navHeight/2)：
    let healthBarWidth = 200;
    let btnW = pathBtn.size().width;    // p5.Button 实例的宽度
    let btnH = pathBtn.size().height;
    // 我们要把按钮 x 放在：血条左边 10px 处
    let bx = width/2 - healthBarWidth/2 - btnW - 10;
    let by = navHeight/2 - btnH/2;
    pathBtn.position(bx, by);

    // —— 下面是原来的 TopBar 背景和内容 —— 
    noStroke();
    fill(139, 105, 70);
    rect(0, 0, width, navHeight);
    noStroke();
    fill(139, 105, 70);
    rect(0, 0, width, navHeight);

    // 暂停/菜单 按钮
    textSize(28);
    textAlign(LEFT, CENTER);
    fill(255);
    text("≡", 24, navHeight/2);

    // 血条
    drawHealthBar(width / 2, navHeight / 2);

    // 道具计数
    fill(255, 223, 0);
    textSize(16);
    textAlign(LEFT, CENTER);
    text(`🔶${collectCount}`, width / 2 + 120, navHeight / 2);

    // 剩余时间
    if (hasStarted && !showResult) {
      // —— 关键改动：用 pausedTime 代替 millis() 让表停住 —— 
      // pausedTime 在没暂停时等于 millis()，暂停时等于 pauseStart
      let now = showPauseUI ? pauseStart : millis();
      let elapsed = (now - startTime) / 1000;
      let remaining = max(0, floor(maxTime - elapsed));
      textSize(22);
      textAlign(RIGHT, CENTER);
      text("⏱️ " + remaining + "s", width - 40, navHeight / 2);
    }
  pop();
}


function drawSkyGradient() {
  for (let y = 0; y < height; y++) {
    let t = map(y, 0, height, 0, 1);
    let topColor    = color(255, 120, 20);
    let bottomColor = color(80,   0, 100);
    stroke(lerpColor(topColor, bottomColor, t));
    line(0, y, width, y);
  }
}

function generateObstacles() {
  obstacles = [];
  let mountainCount = 5, gap = width / mountainCount;
  for (let i = 0; i < mountainCount; i++) {
    let x = width + i * gap * 1.5;
    let peakH = random(200, 350);
    obstacles.push({
      type: 'mountain',
      x,
      peakHeight: peakH,
      baseWidth: gap,
      avoidRadius: peakH * 0.8
    });
  }
  let turbineCount = 4;
  for (let i = 0; i < turbineCount; i++) {
    let x = width + i * obstacleSpacing;
    let towerH = random(150, 300), bladeL = random(40, 60);
    obstacles.push({
      type: 'turbine',
      x,
      towerHeight: towerH,
      bladeLength: bladeL,
      angle: random(TWO_PI),
      avoidRadius: bladeL + 20
    });
  }
}

function generateBubbles() {
  bubbles = [];
  for (let i = 0; i < 50; i++) {
    bubbles.push({
      x: random(width),
      y: random(navHeight + 10, height),
      r: random(3, 8),
      alpha: random(100, 200),
      speed: random(0.5, 1.5),
    });
  }
}

function drawClouds() {
  noStroke();
  fill(255, 240, 220, 200);
  let cloudCount = 5;
  for (let i = 0; i < cloudCount; i++) {
    let x = map(i, 0, cloudCount, 0, width) + sin(frameCount * 0.01 + i) * 20;
    let y = navHeight + 50 + i * 10;
    ellipse(x, y, 200, 60);
    ellipse(x + 40, y + 10, 180, 50);
    ellipse(x - 40, y + 10, 180, 50);
  }
}

function drawObstacles() {
  for (let obs of obstacles) {
    let screenX = obs.x - scrollOffset;
    if (screenX < -200 || screenX > width + 200) continue;
    if (obs.type === 'mountain') {
      noStroke();
      fill(50, 30, 0);
      triangle(
        screenX - obs.baseWidth / 2, height,
        screenX + obs.baseWidth / 2, height,
        screenX, height - obs.peakHeight
      );
    } else if (obs.type === 'turbine') {
      stroke(150); strokeWeight(4);
      line(screenX, height, screenX, height - obs.towerHeight);
      push();
        translate(screenX, height - obs.towerHeight);
        rotate(obs.angle);
        strokeWeight(3);
        for (let j = 0; j < 3; j++) {
          line(0, 0, obs.bladeLength, 0);
          rotate(TWO_PI / 3);
        }
      pop();
      obs.angle += 0.02;
    }
  }
}

function updateBoids() {
  outer:
  for (let i = boids.length - 1; i >= 0; i--) {
    let boid = boids[i];
    // 碰撞
    for (let obs of obstacles) {
      let screenX = obs.x - scrollOffset;
      if (obs.type === 'mountain') {
        let halfW = obs.baseWidth / 2;
        let topY  = height - obs.peakHeight;
        if (
          boid.position.x > screenX - halfW &&
          boid.position.x < screenX + halfW &&
          boid.position.y > topY
        ) {
          boids.splice(i, 1);
          continue outer;
        }
      } else if (obs.type === 'turbine') {
        let hubY = height - obs.towerHeight;
        let d = dist(boid.position.x, boid.position.y, screenX, hubY);
        if (d < obs.bladeLength) {
          boids.splice(i, 1);
          continue outer;
        }
      }
    }

    // 边界 & 群体 & 吸附
    boid.edges();
    boid.flock(boids);
    if (attractMode) boid.attract(mouseX, mouseY);

    // 更新 & 目标
    boid.update();
    if (goalZone && !boid.reachedGoal) {
      let d = dist(boid.position.x, boid.position.y, goalZone.x, goalZone.y);
      if (d < goalZone.r) boid.reachedGoal = true;
    }

    boid.show(drawMigratingBird);
  }
}

function drawGoal() {
  push();
    fill(0, 255, 100, 80);
    stroke(0, 255, 100); strokeWeight(4);
    ellipse(goalZone.x, goalZone.y, goalZone.r * 2);
  pop();
}

function drawExplosions() {
  for (let i = explosions.length - 1; i >= 0; i--) {
    let ex = explosions[i];
    fill(255, 150, 0, ex.alpha); noStroke();
    ellipse(ex.x, ex.y, ex.size);
    ex.size += 1.5; ex.alpha -= 6;
    if (ex.alpha <= 0) explosions.splice(i, 1);
  }
}

function drawHealthBar(x, y) {
  let barWidth = 200, barHeight = 18;
  let current = boids.length;
  let healthRatio = current / totalBoids;
  let barColor = color(0, 220, 100);
  if (healthRatio < 0.6) barColor = color(255, 165, 0);
  if (healthRatio < 0.3) {
    let blink = frameCount % 20 < 10;
    barColor = blink ? color(255, 60, 60) : color(120, 0, 0);
  }

  rectMode(CENTER);
  fill(50, 50, 50, 220); stroke(80); strokeWeight(2);
  rect(x, y, barWidth, barHeight, 10);
  noStroke(); fill(barColor);
  rect(x, y, barWidth * healthRatio, barHeight, 10);

  fill(255); textSize(14); textAlign(CENTER, CENTER);
  text(`${current} / ${totalBoids}`, x, y);
}

function checkGameState() {
  let elapsed = (millis() - startTime) / 1000;
  let reachedCount = boids.filter(b => b.reachedGoal).length;
  let reachRate = reachedCount / totalBoids;
  let survivalRate = boids.length / totalBoids;
  if (reachRate >= 0.8 && !showResult) {
    resultText = "successful migration！"; showResult = true; levelPassed = true; return;
  }
  if (survivalRate < 0.8 && !showResult) {
    resultText = "Challenge failed！"; showResult = true; levelPassed = false; return;
  }
  if (elapsed >= maxTime && !showResult) {
    resultText = "Timeout ！"; showResult = true; levelPassed = false;
  }
}

function drawResultScreen() {
  // 先画背景渐变和云朵
  drawSkyGradient();
  drawClouds();

  // —— 1) 半透明淡木纹遮罩 —— 
  push();
    fill(210, 180, 140, 200); // 淡木纹色 + 半透明
    noStroke();
    rect(0, 0, width, height);
  pop();

  // —— 2) 中心内容框 —— 
  push();
    rectMode(CENTER);
    fill(160, 110, 60);          // 深木纹色背景
    stroke(100, 60, 20);         // 木纹边框
    strokeWeight(2);
    // 宽 400，高 240，圆角 12
    rect(width/2, height/2, 400, 240, 12);

    // —— 3) 标题文字 —— 
    noStroke();
    fill(245, 240, 230);         // 浅米色文字
    textAlign(CENTER, CENTER);
    textSize(32);
    text(resultText, width/2, height/2 - 60);

    // —— 4) 按钮 —— 
    // “再玩一次” 或 “Try again”
    fill(100, 60, 20);           // 更深的木纹色按钮
    rect(width/2, height/2 - 0, 220, 40, 8);
    fill(245, 240, 230);
    textSize(18);
    text("Try again", width/2, height/2 - 0);

    // “返回主页” 或 “Next round”
    fill(100, 60, 20);
    rect(width/2, height/2 + 60, 220, 40, 8);
    fill(245, 240, 230);
    text(levelPassed ? "Next round" : "Return to home page", width/2, height/2 + 60);
  pop();
}


function drawPauseScreen() {
  // —— 1) 整体半透明木纹背景 —— 
  push();
    // 淡木纹色，稍微带点透明
    fill(210, 180, 140, 200);
    noStroke();
    rect(0, 0, width, height);
  pop();

  // —— 2) 中心菜单框 —— 
  push();
    rectMode(CENTER);
    // 深木纹色做背景，深一些的棕色边框
    fill(160, 110, 60);
    stroke(100, 60, 20);
    strokeWeight(2);
    rect(width/2, height/2, 300, 200, 12);

    // —— 标题文字 —— 
    noStroke();
    fill(50, 30, 20);     // 深木纹色的深棕文字
    textAlign(CENTER, CENTER);
    textSize(24);
    text("Game suspended", width/2, height/2 - 60);

    // —— Continue 按钮 —— 
    // 按钮背景
    fill(100, 60, 20);    // 更深的木纹色
    rect(width/2, height/2, 220, 40, 8);
    // 按钮文字
    fill(245, 240, 230);  // 浅色文字，和木纹色对比
    textSize(18);
    text("Continue playing", width/2, height/2);

    // —— Return 按钮 —— 
    fill(100, 60, 20);
    rect(width/2, height/2 + 60, 220, 40, 8);
    fill(245, 240, 230);
    text("Return to home page", width/2, height/2 + 60);
  pop();
}


function mousePressed() {
  // 点击左上角菜单/暂停
if (!showResult && mouseY < navHeight && mouseX < 50) {
  if (!showPauseUI) {
    // 进入暂停
    pauseStart = millis();
    isPaused   = true;
    showPauseUI = true;
  } else {
    // 退出暂停
    let pauseEnd = millis();
    startTime += (pauseEnd - pauseStart);
    isPaused   = false;
    showPauseUI = false;
  }
  return;
}


  // 如果在暂停菜单
  if (showPauseUI) {
    // “继续游戏”
if (
  mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
  mouseY > height/2 - 20 && mouseY < height/2 + 20
) {
  // 退出暂停，同样要补偿 startTime
  let pauseEnd = millis();
  startTime += (pauseEnd - pauseStart);
  isPaused    = false;
  showPauseUI = false;
}

    // “返回主菜单”
    else if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 + 40 && mouseY < height/2 + 100
    ) {
      window.location.href = "main.html";
    }
    return;
  }

  if (showResult) {
    // 再玩一次
    if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 - 20 && mouseY < height/2 + 20
    ) {
      retryCount++;
      initBoids();
    }
    // 下一关 或 返回主页
    else if (
      mouseX > width/2 - 80 && mouseX < width/2 + 80 &&
      mouseY > height/2 + 40 && mouseY < height/2 + 80
    ) {
      if (levelPassed) {
        // 完整通关，保存第一关数据后进入第二关
        saveLevelRecord(1);
        window.location.href = "level2intro.html";
      } else {
        // 失败，清空临时记录并返回主页
        localStorage.removeItem("tmpRecord");
        window.location.href = "main.html";
      }
    }
  } else {
    // 正常游戏内点击：启动/吸附切换
    if (!hasStarted) {
      hasStarted = true;
      startTime = millis();
    }
    attractMode = !attractMode;
  }
  // 新增：点击“绘制路径”按钮
  if (drawPathMode) {
    // 立刻清空之前的线路，让 boids 回归常规逻辑
    pathQueue = [];
    isDrawingPath = true;
    currentPath   = [{ x: mouseX, y: mouseY }];
    return;
  }
}

function mouseDragged() {
  // 只有正在绘制时，才往 currentPath 里 push
  if (drawPathMode && isDrawingPath) {
    currentPath.push({ x: mouseX, y: mouseY });
  }
}

function mouseReleased() {
  // 完成一次绘制，塞入队列，Boids 就会去执行
  if (drawPathMode && isDrawingPath) {
    isDrawingPath = false;
    if (currentPath.length > 1) {
      pathQueue = [ currentPath.slice() ];  // 新路线立刻替换旧路线
    }
    currentPath = [];
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function drawMigratingBird(x, y, angle) {
  push();
    translate(x, y);
    rotate(angle);
    noStroke(); fill(230, 230, 255);
    beginShape();
      vertex(12, 0);
      vertex(-10, 6);
      vertex(-8, 0);
      vertex(-10, -6);
    endShape(CLOSE);
    fill(80); ellipse(10, 0, 4, 4);
  pop();
}

function generateCollectibles() {
  collectibles = [];
  // 减半：原来是 10 个，这里改成 5 个
  const count = 5;
  // 上半区范围：从 navHeight 结束的地方，到画面高度的中点
  const yMin = navHeight + 20;
  const yMax = navHeight + (height - navHeight) * 0.5 - 20;
  
  for (let i = 0; i < count; i++) {
    collectibles.push({
      x: random(width, width * 2),
      // 只在上半区生成
      y: random(yMin, yMax),
      r: 12
    });
  }
}


function renderCollectibles() {
  noStroke();
  fill(255, 223, 0);
  for (let i = collectibles.length - 1; i >= 0; i--) {
    let c  = collectibles[i];
    let sx = c.x - scrollOffset;
    // 画球
    if (sx > -20 && sx < width + 20) {
      ellipse(sx, c.y, c.r * 2);
    }
    // 碰撞检测
    for (let b of boids) {
      if (dist(b.position.x, b.position.y, sx, c.y) < c.r + 6) {
        // 闪光特效
        flashEffects.push({ x: sx, y: c.y, t: millis() });
        // 从数组移除这个球
        collectibles.splice(i, 1);
        // 计数+1
        collectCount++;
        // **新增：如果活着的 boid 小于总数，就生成一个新的 boid**
        if (boids.length < totalBoids) {
          // 用小球的世界坐标作为新鸟出生点
          boids.push(new Boid(c.x, c.y));
        }
        break;
      }
    }
  }
}


function renderFlash() {
  for (let i = flashEffects.length - 1; i >= 0; i--) {
    let f = flashEffects[i], d = millis()-f.t;
    if (d > 300) { flashEffects.splice(i,1); continue; }
    let alpha = map(d,0,300,255,0), rad = map(d,0,300,8,32);
    noFill(); stroke(255,255,0,alpha); strokeWeight(2);
    ellipse(f.x, f.y, rad*2);
  }
}

function drawPaths() {
  drawingContext.setLineDash([12,8]);
  stroke(255); strokeWeight(PATH_WIDTH); noFill();
  for (let path of pathQueue) {
    for (let i = 0; i < path.length - 1; i++) {
      let alpha = map(i, 0, path.length - 1, 255, 50);
      stroke(255, alpha);
      let p1 = path[i], p2 = path[i + 1];
      line(p1.x, p1.y, p2.x, p2.y);
    }
  }
  drawingContext.setLineDash([]);
  // 如果正在画，还要画 currentPath
  if (isDrawingPath && currentPath.length > 1) {
    drawingContext.setLineDash([12,8]);
    stroke(255,200); strokeWeight(PATH_WIDTH);
    beginShape();
      currentPath.forEach(p => vertex(p.x, p.y));
    endShape();
    drawingContext.setLineDash([]);
  }
}




  function runPathGuidance() {
    // 如果没有有效路径，就退回到普通逻辑
  if (!pathQueue.length || pathQueue[0].length < 2) {
    runOriginalLogic();
    return;
  }

   let path = pathQueue[0];
  const startPt = createVector(path[0].x, path[0].y);
  const endPt   = createVector(path[path.length - 1].x, path[path.length - 1].y);
 
  // 1) 画终点
  if (goalZone) drawGoal();

  // 2) 碰撞检测 & 删除死去的 boids
  outer:
  for (let i = boids.length - 1; i >= 0; i--) {
    let boid = boids[i];
    for (let obs of obstacles) {
      let screenX = obs.x - scrollOffset;
      if (obs.type === 'mountain') {
        let halfW = obs.baseWidth / 2;
        let topY  = height - obs.peakHeight;
        if (
          boid.position.x > screenX - halfW &&
          boid.position.x < screenX + halfW &&
          boid.position.y > topY
        ) {
          explosions.push({ x: boid.position.x, y: boid.position.y, size: 2, alpha: 255 });
          boids.splice(i, 1);
          continue outer;
        }
      } else if (obs.type === 'turbine') {
        let hubY = height - obs.towerHeight;
        let d = dist(boid.position.x, boid.position.y, screenX, hubY);
        if (d < obs.bladeLength) {
          explosions.push({ x: boid.position.x, y: boid.position.y, size: 2, alpha: 255 });
          boids.splice(i, 1);
          continue outer;
        }
      }
    }
  }

   // 3) 更新每个 boid：先边界&群体，再“流场吸引 or 起点吸附”
  for (let b of boids) {
    b.edges();
    b.flock(boids);

    // 计算 boid 到这条 path 最近距离
    let closestD = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      let A  = createVector(path[i].x, path[i].y);
      let B  = createVector(path[i+1].x, path[i+1].y);
      let projT = constrain(
        p5.Vector.sub(b.position, A).dot(p5.Vector.sub(B, A)) 
          / p5.Vector.sub(B, A).magSq(),
        0, 1
      );
      let Q = p5.Vector.add(A, p5.Vector.sub(B, A).mult(projT));
      closestD = min(closestD, p5.Vector.dist(b.position, Q));
    }

    if (closestD > PATH_INFLUENCE_RADIUS) {
      // 还未进入流场影响范围，先以常规 attract 赶往线路起点
      b.attract(startPt.x, startPt.y);
    } else {
      // 进入影响范围后，沿切线方向流场吸引
      b.followPath(path);
    }

    b.update();
    b.velocity.limit(b.maxSpeed);
    b.show(drawMigratingBird);
  }

  // 4) 如果所有 boid 都已“走过”线路末端，就清掉线路
  const finishThreshold = PATH_INFLUENCE_RADIUS / 2;
  if (boids.length > 0 && boids.every(b => 
      p5.Vector.dist(b.position, endPt) < finishThreshold
    )) {
    pathQueue = [];
  }


  // —— 渲染 Boids —— 
  boids.forEach(b => {
    b.edges();
    b.show(drawMigratingBird);
  });

  // —— 在路径模式下也要做通关/失败判定 —— 
  checkGameState();

  // —— 最后画顶栏 + 结果/暂停面板 —— 
  drawTopBar();
  if (showResult) {
    drawResultScreen();
  } else if (showPauseUI) {
    drawPauseScreen();
  }
}




function runOriginalLogic() {
  // —— 1) 更新世界状态（原来的 updateWorld() 调用） —— 
  if (hasStarted && !showResult && !isPaused) {
    updateWorld();
  }

  // —— 2) 渲染可收集道具 & 闪光效果 —— 
  renderCollectibles();
  renderFlash();

  // —— 3) 绘制顶部 UI（血条 / 倒计时 / 道具计数 / 暂停按钮） —— 
  drawTopBar();

  // —— 4) 结果或暂停界面覆盖 —— 
  if (showResult) {
    drawResultScreen();
  } else if (showPauseUI) {
    drawPauseScreen();
  }
}





