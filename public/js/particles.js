// 粒子效果
window.addEventListener("load", function() {
    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let particles = [];
    const colors = ['#c9a227', '#e8d48b', '#d4af37', '#f0e68c'];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.twinkle = Math.random() * 0.02;
            this.angle = Math.random() * Math.PI * 2;
        }
        update() {
            this.x += this.speedX + Math.sin(this.angle) * 0.2;
            this.y += this.speedY + Math.cos(this.angle) * 0.2;
            this.angle += 0.005;
            this.opacity += this.twinkle;
            if (this.opacity <= 0.1 || this.opacity >= 0.7) this.twinkle *= -1;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // 鼠标交互粒子
    class MouseParticle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * 3 + 1;
            this.speedX = (Math.random() - 0.5) * 3;
            this.speedY = (Math.random() - 0.5) * 3;
            this.life = 1;
            this.decay = Math.random() * 0.02 + 0.01;
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.life -= this.decay;
            this.size *= 0.98;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.life * 0.5;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        isDead() {
            return this.life <= 0;
        }
    }

    // 初始化粒子
    function initParticles() {
        particles = [];
        const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 15000));
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }
    initParticles();

    let mouseParticles = [];
    canvas.addEventListener('mousemove', (e) => {
        for (let i = 0; i < 3; i++) {
            mouseParticles.push(new MouseParticle(e.clientX, e.clientY));
        }
    });

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制背景粒子
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // 绘制鼠标粒子
        mouseParticles = mouseParticles.filter(p => !p.isDead());
        mouseParticles.forEach(p => {
            p.update();
            p.draw();
        });

        // 绘制连线
        ctx.strokeStyle = 'rgba(201, 162, 39, 0.1)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.globalAlpha = (1 - dist / 120) * 0.3;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        }

        requestAnimationFrame(animate);
    }
    animate();
});
