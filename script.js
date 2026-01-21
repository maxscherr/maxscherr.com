// 1. RANDOM SCRAMBLE ON LOAD (Now defaults to Grid/Form)
// PHYSICS GLOBALS
let engine, runner, render, composite, walls = [];

window.addEventListener('load', () => {
    arrangeGrid();
    randomizeButtonColor();
    setupSocialInteractions();

    // Hide Loading Screen on full load
    const loader = document.getElementById('loading-screen');
    if (loader) {
        // Force a minimum time? No, user wants "only until the whole site loads".
        // But let's give it a tiny buffer so it doesn't flash if instant.
        // Actually simple is best as requested.
        loader.classList.add('hidden');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500); // Wait for transition
    }
});

function scrambleItems() {
    // 1. Setup Matter.js aliases
    const Engine = Matter.Engine,
        Runner = Matter.Runner,
        Bodies = Matter.Bodies,
        Composite = Matter.Composite,
        Events = Matter.Events,
        Body = Matter.Body;

    // 2. Initialize Engine
    engine = Engine.create();
    engine.world.gravity.y = 0; // Zero gravity for space floating
    engine.world.gravity.x = 0;

    // 3. Create Runner
    runner = Runner.create();

    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const wallThickness = 1000; // Thicker walls to prevent tunneling

    // 4. Create Walls (Invisible boundaries)
    // Use low friction/high restitution to prevent sticking
    const wallOptions = {
        isStatic: true,
        friction: 0,
        frictionStatic: 0,
        restitution: 1.0
    };

    walls = [
        Bodies.rectangle(containerWidth / 2, -wallThickness / 2, containerWidth + wallThickness * 2, wallThickness, wallOptions), // Top
        Bodies.rectangle(containerWidth / 2, containerHeight + wallThickness / 2, containerWidth + wallThickness * 2, wallThickness, wallOptions), // Bottom
        Bodies.rectangle(containerWidth + wallThickness / 2, containerHeight / 2, wallThickness, containerHeight + wallThickness * 2, wallOptions), // Right
        Bodies.rectangle(-wallThickness / 2, containerHeight / 2, wallThickness, containerHeight + wallThickness * 2, wallOptions) // Left
    ];
    Composite.add(engine.world, walls);

    // 5. Create Bodies for Items
    const items = document.querySelectorAll('.item, .social-btn.floating');

    items.forEach(item => {
        const width = item.offsetWidth;
        const height = item.offsetHeight;

        // Calculate diagonal to determine safe radius for rotation
        const diagonal = Math.sqrt(width * width + height * height);
        const safetyRadius = diagonal / 2;
        const safePad = 25; // Additional cushion

        const minX = safetyRadius + safePad;
        const maxX = containerWidth - safetyRadius - safePad;
        const minY = safetyRadius + safePad;
        const maxY = containerHeight - safetyRadius - safePad;

        // Clamp to avoid bugs if item > screen (fallback to center)
        const validMaxX = Math.max(maxX, minX);
        const validMaxY = Math.max(maxY, minY);

        let x = Math.random() * (validMaxX - minX) + minX;
        let y = Math.random() * (validMaxY - minY) + minY;

        // Fallback if the calculation gets wonky (e.g. validMax < min)
        if (minX > maxX) x = containerWidth / 2;
        if (minY > maxY) y = containerHeight / 2;

        // Set DOM styles for absolute positioning controlled by Physics
        item.style.position = 'absolute';
        item.style.left = '0'; // Position controlled by transform
        item.style.top = '0'; // Position controlled by transform
        // Clear CSS animations
        item.style.animation = 'none';
        item.style.transition = 'none'; // Physics needs instant updates

        if (item.classList.contains('social-btn')) {
            item.style.zIndex = '60';
        }
        item.style.opacity = '1';

        // Create Box Body
        const body = Bodies.rectangle(x, y, width, height, {
            restitution: 1.0, // Perfect elastic bounce
            friction: 0,
            frictionAir: 0, // No air resistance (perpetual motion)
            angle: (Math.random() * Math.PI * 2), // Random rotation
            plugin: { domElement: item }
        });

        // Add random initial velocity
        Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 8, // Speed
            y: (Math.random() - 0.5) * 8
        });

        // Add random initial rotation speed
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);

        Composite.add(engine.world, body);
    });

    // 6. Start Simulation
    Runner.run(runner, engine);

    // 7. Sync Loop: Update DOM to match Physics + Stuck Detection
    Events.on(engine, 'afterUpdate', function () {
        if (document.querySelector('.gallery.return-to-form')) return; // Safety

        const bodies = Composite.allBodies(engine.world);
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        const cornerThreshold = 100; // Distance from corner to be considered "in corner"
        const minSpeed = 0.5; // Minimum speed before considered stuck

        bodies.forEach(body => {


            const el = body.plugin && body.plugin.domElement;
            if (!el) return;

            // Physics body position is center of mass
            const { x, y } = body.position;
            const angle = body.angle;
            const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);

            // STUCK DETECTION: If in a corner and moving very slowly, give it a kick
            const inLeftEdge = x < cornerThreshold;
            const inRightEdge = x > containerWidth - cornerThreshold;
            const inTopEdge = y < cornerThreshold;
            const inBottomEdge = y > containerHeight - cornerThreshold;
            const inCorner = (inLeftEdge || inRightEdge) && (inTopEdge || inBottomEdge);

            // SELF-HEALING: If body is static (frozen) but element is NOT focused, Force Unfreeze!
            // This fixes the "stuck in corner" bug if closeAll missed the body.
            if (body.isStatic && !el.classList.contains('is-focused')) {
                Matter.Body.setStatic(body, false);
                Matter.Body.setSleeping(body, false);

                // Rescue if position is garbage (0,0 default or out of bounds)
                if (x < 50 || x > containerWidth - 50 || y < 50 || y > containerHeight - 50) {
                    Matter.Body.setPosition(body, {
                        x: containerWidth / 2 + (Math.random() - 0.5) * 100,
                        y: containerHeight / 2 + (Math.random() - 0.5) * 100
                    });
                    Matter.Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 8,
                        y: (Math.random() - 0.5) * 8
                    });
                }
                // Continue to update transform this frame!
            }

            if (body.isStatic) return;

            if (speed < minSpeed) {
                // Initialize or increment stuck counter
                body.stuckFrames = (body.stuckFrames || 0) + 1;

                // If stuck for more than 30 frames (~0.5 seconds), kick it
                if (body.stuckFrames > 30) {
                    // Calculate kick direction: away from nearest edge/corner
                    let kickX = (Math.random() - 0.5) * 10;
                    let kickY = (Math.random() - 0.5) * 10;

                    // Bias kick away from edges
                    if (inLeftEdge) kickX = Math.abs(kickX) + 3;
                    if (inRightEdge) kickX = -Math.abs(kickX) - 3;
                    if (inTopEdge) kickY = Math.abs(kickY) + 3;
                    if (inBottomEdge) kickY = -Math.abs(kickY) - 3;

                    Body.setVelocity(body, { x: kickX, y: kickY });
                    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);
                    body.stuckFrames = 0; // Reset counter
                }
            } else {
                body.stuckFrames = 0; // Reset if moving
            }

            const w = el.offsetWidth;
            const h = el.offsetHeight;

            // If item is focused, DO NOT update its transform from physics
            if (el.classList.contains('is-focused')) {
                body.stuckFrames = 0; // Reset stuck counter
                return;
            }

            // Translate to top-left for DOM transform
            el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${angle}rad)`;
        });
    });
}

function updatePhysicsBounds() {
    if (!engine || !engine.world) return;

    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const wallThickness = 1000;

    // Remove old walls
    if (walls && walls.length) {
        Matter.Composite.remove(engine.world, walls);
    }

    const wallOptions = {
        isStatic: true,
        friction: 0,
        frictionStatic: 0,
        restitution: 1.0
    };

    walls = [
        Matter.Bodies.rectangle(containerWidth / 2, -wallThickness / 2, containerWidth + wallThickness * 2, wallThickness, wallOptions), // Top
        Matter.Bodies.rectangle(containerWidth / 2, containerHeight + wallThickness / 2, containerWidth + wallThickness * 2, wallThickness, wallOptions), // Bottom
        Matter.Bodies.rectangle(containerWidth + wallThickness / 2, containerHeight / 2, wallThickness, containerHeight + wallThickness * 2, wallOptions), // Right
        Matter.Bodies.rectangle(-wallThickness / 2, containerHeight / 2, wallThickness, containerHeight + wallThickness * 2, wallOptions) // Left
    ];

    Matter.Composite.add(engine.world, walls);

    // Keep items inside new bounds
    const bodies = Matter.Composite.allBodies(engine.world);
    bodies.forEach(body => {
        if (body.isStatic) return;

        let { x, y } = body.position;
        let clamped = false;
        const pad = 50;

        if (x < pad) { x = pad; clamped = true; }
        if (x > containerWidth - pad) { x = containerWidth - pad; clamped = true; }
        if (y < pad) { y = pad; clamped = true; }
        if (y > containerHeight - pad) { y = containerHeight - pad; clamped = true; }

        if (clamped) {
            Matter.Body.setPosition(body, { x, y });
            // Wake up if sleeping and give a little nudge
            Matter.Body.setSleeping(body, false);
            const speed = body.speed;
            if (speed < 0.5) {
                Matter.Body.setVelocity(body, {
                    x: (Math.random() - 0.5) * 5,
                    y: (Math.random() - 0.5) * 5
                });
            }
        }
    });
}

// ... 



const overlay = document.getElementById('overlay');

// 2. FILM LOADING LOGIC
function loadFilm(element) {
    // If it's already focused, don't re-load everything
    if (element.classList.contains('is-focused')) return;

    const container = element.querySelector('.video-container');
    const videoUrl = element.getAttribute('data-video-src');
    const thumbnail = element.querySelector('.thumbnail');

    if (!videoUrl) return;

    // Focus first (which will skip clearing this element), then insert the video tag
    focusMe(element);

    // Clear container explicitly
    container.innerHTML = '';

    // Create Video Element Programmatically
    const video = document.createElement('video');
    video.id = 'active-video';
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = 'auto';

    container.appendChild(video);

    // Check for HLS (.m3u8) source
    const isM3U8 = videoUrl.endsWith('.m3u8');

    if (isM3U8 && window.Hls && Hls.isSupported()) {
        const hls = new Hls({
            startFragPrefetch: true,
            enableWorker: true
        });
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        video.hls = hls; // Store HLS instance for cleanup

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            video.play().catch(e => console.log("Autoplay blocked/failed", e));
        });
    } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        // For Safari, which supports HLS natively
        video.src = videoUrl;
        video.play().catch(e => console.log("Native autoplay failed", e));
    } else {
        // Standard MP4
        video.src = videoUrl;
        video.play().catch(e => console.log("MP4 play failed", e));
    }

    // Prevent clicking the video controls from closing the item
    video.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    // Hide thumbnail and show video
    thumbnail.style.display = 'none';
    container.style.display = 'block';
}

// 3. ESSAY LOADING LOGIC
async function loadAndFocus(element, filePath) {
    if (element.classList.contains('is-focused')) return;

    // IF WE ARE IN GRID MODE (RETURN TO FORM), DO NOT FOCUS/ZOOM -- REMOVED per user correction
    // if (document.querySelector('.gallery').classList.contains('return-to-form')) return;

    const contentArea = element.querySelector('.essay-content');
    if (contentArea.innerText === "") {
        try {
            const response = await fetch(filePath);
            const text = await response.text();
            contentArea.innerText = text;
        } catch (e) { contentArea.innerText = "Error loading text."; }
    }
    focusMe(element);
}

// 4. FOCUS & CLOSE LOGIC
function focusMe(element) {
    if (element.classList.contains('is-focused')) {
        closeAll();
        return;
    }

    // 1. First (Record start state)
    const firstRect = element.getBoundingClientRect();

    // Create a placeholder to hold the grid space so it doesn't collapse/jerk
    const placeholder = document.createElement('div');
    placeholder.style.width = element.offsetWidth + 'px';
    placeholder.style.height = element.offsetHeight + 'px';
    placeholder.style.flex = '0 0 auto';
    placeholder.classList.add('grid-placeholder'); // Just in case we need to style it
    element.parentNode.insertBefore(placeholder, element);
    element._placeholder = placeholder;

    closeAll(element); // Reset others

    // 2. Last (Apply focus class & clean styles)
    element.classList.add('is-focused');
    overlay.classList.add('active');

    // Overlay Logic:
    // Always dim the background to focus on the item
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    // Dim the buttons to blend in
    document.querySelectorAll('.social-btn, #return-btn').forEach(b => b.style.opacity = '0.15');

    const media = element.querySelector('img, video, .thumbnail');
    if (media) {
        media.style.removeProperty('height');
        media.style.removeProperty('width');
    }
    const essayBox = element.querySelector('.essay-box');
    if (essayBox) {
        essayBox.style.removeProperty('height');
        essayBox.style.removeProperty('width');
    }

    // 3. Invert (Calculate delta)
    const lastRect = element.getBoundingClientRect();
    const dx = firstRect.left - lastRect.left;
    const dy = firstRect.top - lastRect.top;
    const sw = firstRect.width / lastRect.width;
    const sh = firstRect.height / lastRect.height;

    // PHYSICS INTERACTION: Freeze the body while focused
    if (engine && engine.world) {
        const bodies = Matter.Composite.allBodies(engine.world);
        const body = bodies.find(b => b.plugin && b.plugin.domElement === element);
        if (body) {
            Matter.Body.setStatic(body, true);
        }
    }

    // Apply Invert Transform (force it back to start visually)
    // We use WAAPI for smoother performance than manual style manipulation
    element.animate([
        {
            transformOrigin: 'top left',
            transform: `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`,
            borderRadius: '0px' // optional if you want to animate radius
        },
        {
            transformOrigin: 'top left',
            transform: 'none',
            borderRadius: '0px'
        }
    ], {
        duration: 400,
        easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
        fill: 'both' // keeps it at end state
    });
}

function closeAll(ignoreElement = null) {
    document.querySelectorAll('.item').forEach(item => {
        // If an item is the one we're about to focus, skip clearing it
        if (ignoreElement && item === ignoreElement) return;

        const wasFocused = item.classList.contains('is-focused');

        // Cancel any lingering WAAPI animations (e.g. from focusMe) to release 'transform' control
        item.getAnimations().forEach(anim => anim.cancel());

        item.classList.remove('is-focused');

        // Remove placeholder to let item return to grid
        if (item._placeholder) {
            item._placeholder.remove();
            item._placeholder = null;
        }

        const isDiscoMode = !document.querySelector('.gallery.return-to-form');
        console.log(`[CloseAll] Item: ${item.className}, isDisco: ${isDiscoMode}, wasFocused: ${wasFocused}`);

        // PHYSICS INTERACTION:
        if (engine && engine.world && isDiscoMode) {
            const bodies = Matter.Composite.allBodies(engine.world);
            const body = bodies.find(b => b.plugin && b.plugin.domElement === item);
            if (body) {
                // DISAPPEARING ACT: If in Disco mode, remove the body and hide the element
                if (wasFocused) {
                    console.log("-> DISAPPEARING ITEM!");
                    // We are closing a focused item in Disco Mode -> DISAPPEAR IT
                    Matter.Composite.remove(engine.world, body);
                    item.style.display = 'none';
                } else {
                    // Just a normal background update (likely redundant but safe)
                    Matter.Body.setStatic(body, false);
                }
            } else {
                console.log("-> No physics body found for item!");
            }
        } else if (engine && engine.world) {
            // GRID MODE / RETURN TO FORM SAFETY
            const bodies = Matter.Composite.allBodies(engine.world);
        } else if (engine && engine.world) {
            // GRID MODE / RETURN TO FORM SAFETY
            const bodies = Matter.Composite.allBodies(engine.world);
            const body = bodies.find(b => b.plugin && b.plugin.domElement === item);
            if (body) {
                Matter.Body.setStatic(body, false);

                // RESCUE FROM CORNER/INVALID POSITION
                // If the body is near 0,0 (top-left trap) or out of bounds, reset it
                const { x, y } = body.position;
                const containerWidth = window.innerWidth;
                const containerHeight = window.innerHeight;

                // If it's suspiciously close to 0,0 or significantly out of bounds
                if (x < 50 || x > containerWidth - 50 || y < 50 || y > containerHeight - 50) {
                    Matter.Body.setPosition(body, {
                        x: containerWidth / 2 + (Math.random() - 0.5) * 100,
                        y: containerHeight / 2 + (Math.random() - 0.5) * 100
                    });
                    Matter.Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 8,
                        y: (Math.random() - 0.5) * 8
                    });
                } else {
                    // Just give it a small wake-up nudge
                    Matter.Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 5,
                        y: (Math.random() - 0.5) * 5
                    });
                }
            }
        }

        // RESET VIDEO ITEMS BACK TO GIF
        if (item.classList.contains('film-item')) {
            const container = item.querySelector('.video-container');
            const thumbnail = item.querySelector('.thumbnail');

            // Clean up video properly to prevent audio lingering
            const video = container.querySelector('video');
            if (video) {
                video.pause();
                if (video.hls) video.hls.destroy();
            }

            // Wipe the video player entirely to save memory/bandwidth
            container.innerHTML = "";
            container.style.display = 'none';
            // Show the GIF again
            if (thumbnail) thumbnail.style.display = 'block';
        }
    });
    overlay.classList.remove('active');
    overlay.style.backgroundColor = '';
    // Reset buttons visibility
    document.querySelectorAll('.social-btn, #return-btn').forEach(b => b.style.opacity = '');

    // Easter Egg Check
    checkEasterEgg();

    // If we are in grid mode, we need to restore the layout sizing for the items
    // (Since we stripped it in focusMe)
    if (document.querySelector('.gallery.return-to-form')) {
        calculateJustifiedLayout();
    }
}

overlay.addEventListener('click', () => closeAll());

// 5. ARRANGE INTO GRID / TOGGLE
// DISCO MODE LOGIC
let discoInterval;
const vibrantColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#FF8F33', '#33FFF5', '#8F33FF', '#F533FF', '#FFF533'];
let isEasterEggReady = false; // Flag to track if all items are gone

function startDiscoMode() {
    clearInterval(discoInterval);
    // Instant change
    document.body.style.backgroundColor = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
    // Loop
    discoInterval = setInterval(() => {
        const randomColor = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
        document.body.style.transition = "background-color 1.5s ease"; // Smooth animated transition
        document.body.style.backgroundColor = randomColor;
    }, 1500);
}

function stopDiscoMode() {
    clearInterval(discoInterval);
    document.body.style.transition = "background-color 0.5s ease";
    document.body.style.backgroundColor = "#ffffff";

    // Hide easter egg message if visible
    const msg = document.getElementById('easter-egg-msg');
    if (msg) msg.classList.remove('visible');
    isEasterEggReady = false;
}

function toggleLayout() {
    // SPECIAL EASTER EGG CASE: If ready, clicking this button makes it disappear + shows final message
    if (isEasterEggReady) {
        const btn = document.getElementById('return-btn');
        btn.style.display = 'none'; // Poof

        const msg = document.getElementById('easter-egg-msg');
        if (msg) {
            msg.innerText = "you did it! email me and say so";
        }
        return; // Stop normal toggle
    }

    randomizeButtonColor();
    const btn = document.getElementById('return-btn');
    // Check uppercase because CSS text-transform might affect innerText or just to be safe
    if (btn.innerText.toUpperCase() === "RETURN TO FORM") {
        arrangeGrid();
        btn.innerText = "Lose Form";
    } else {
        loseForm();
        btn.innerText = "Return to Form";
    }
}

function randomizeButtonColor() {
    const btn = document.getElementById('return-btn');
    const instaBtn = document.getElementById('insta-btn');
    const emailBtn = document.getElementById('email-btn');

    // Generate a random base hue
    const baseHue = Math.floor(Math.random() * 360);

    // Create a triadic color scheme (3 colors spaced 120 degrees apart)
    // This ensures they are distinct but complementary/harmonious
    const hue1 = baseHue;
    const hue2 = (baseHue + 120) % 360;
    const hue3 = (baseHue + 240) % 360;

    // Helper to format HSL
    const toHSL = (h) => `hsl(${h}, 70%, 45%)`;

    // Assign colors to buttons
    if (instaBtn) instaBtn.style.backgroundColor = toHSL(hue1);
    // Center button gets the second color
    if (btn) btn.style.backgroundColor = toHSL(hue2);
    // Right button gets the third color
    if (emailBtn) emailBtn.style.backgroundColor = toHSL(hue3);
}

function setupSocialInteractions() {
    const socialBtns = document.querySelectorAll('.social-btn');
    socialBtns.forEach(btn => {
        // 1. Click to Disappear
        btn.addEventListener('click', (e) => {
            // Only active in Disco Mode (floating)
            if (btn.classList.contains('floating')) {
                e.preventDefault();
                btn.style.display = 'none';

                if (engine && engine.world) {
                    const bodies = Matter.Composite.allBodies(engine.world);
                    const body = bodies.find(b => b.plugin && b.plugin.domElement === btn);
                    if (body) Matter.Composite.remove(engine.world, body);
                }

                checkEasterEgg();
            }
        });

        // 2. Hover to Pause (Makes clicking easier)
        btn.addEventListener('mouseenter', () => {
            if (btn.classList.contains('floating') && engine && engine.world) {
                const bodies = Matter.Composite.allBodies(engine.world);
                const body = bodies.find(b => b.plugin && b.plugin.domElement === btn);
                if (body) {
                    // Freeze it nicely
                    Matter.Body.setStatic(body, true);
                }
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (btn.classList.contains('floating') && engine && engine.world && btn.style.display !== 'none') {
                const bodies = Matter.Composite.allBodies(engine.world);
                const body = bodies.find(b => b.plugin && b.plugin.domElement === btn);
                if (body) {
                    // Unfreeze
                    Matter.Body.setStatic(body, false);
                    Matter.Body.setSleeping(body, false);
                    // Give it a gentle push so it resumes naturally
                    Matter.Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 4,
                        y: (Math.random() - 0.5) * 4
                    });
                }
            }
        });
    });
}

function checkEasterEgg() {
    // Only valid in Disco Mode
    if (document.querySelector('.gallery.return-to-form')) return;

    // Check visibility of all items and social buttons
    const items = document.querySelectorAll('.item');
    const socialBtns = document.querySelectorAll('.social-btn');

    let visibleCount = 0;

    items.forEach(el => {
        if (el.style.display !== 'none') visibleCount++;
    });

    socialBtns.forEach(el => {
        if (el.style.display !== 'none') visibleCount++;
    });

    if (visibleCount === 0) {
        // TRIGGER "CONGRATS"
        isEasterEggReady = true;

        const msg = document.getElementById('easter-egg-msg');
        if (msg) {
            msg.innerText = "congrats";
            msg.classList.add('visible');
            msg.style.zIndex = "9999";
        }

        // Ensure Return to Form button is visible (it should be)
        const retBtn = document.getElementById('return-btn');
        if (retBtn) retBtn.style.display = 'block';
    }
}

function arrangeGrid() {
    stopDiscoMode();
    // Stop Physics Engine if running
    if (runner) Matter.Runner.stop(runner);
    if (engine) {
        Matter.World.clear(engine.world);
        Matter.Engine.clear(engine);
    }
    walls = []; // Clear global walls reference

    const gallery = document.querySelector('.gallery');
    closeAll(); // Close any focused item

    // Reset Social Buttons
    const socialBtns = document.querySelectorAll('.social-btn');
    socialBtns.forEach(btn => {
        btn.classList.remove('floating');
        btn.style.position = ''; // Revert to CSS fixed
        btn.style.top = '';
        btn.style.left = '';
        btn.style.transform = '';
        btn.style.zIndex = '';
        btn.style.opacity = '';
        btn.style.animation = '';
        btn.style.display = ''; // Ensure visible if it disappeared
    });

    // Remove old columns if they exist (cleanup from previous version)
    const oldCols = gallery.querySelector('.columns');
    if (oldCols) {
        // move items back out first
        const movedItems = oldCols.querySelectorAll('.item');
        movedItems.forEach(i => gallery.appendChild(i));
        oldCols.remove();
    }

    // Also remove grid-container if it exists (to re-roll)
    const oldGrid = gallery.querySelector('.grid-container');
    if (oldGrid) {
        const movedItems = oldGrid.querySelectorAll('.item');
        movedItems.forEach(i => gallery.appendChild(i));
        oldGrid.remove();
    }

    // Collect and shuffle
    const items = Array.from(gallery.querySelectorAll('.item'));

    // Fisher-Yates Shuffle
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }

    // Create new grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container';
    gallery.appendChild(gridContainer);
    gallery.classList.add('return-to-form');

    // Move items to grid
    items.forEach(item => {
        // Reset styles
        item.style.removeProperty('top');
        item.style.removeProperty('left');
        item.style.removeProperty('transform');
        item.style.opacity = '';
        item.style.display = ''; // Restore visibility!
        item.classList.remove('is-focused');

        // Clean up previous inline styles
        const media = item.querySelector('img, video, .thumbnail');
        if (media) {
            media.style.removeProperty('height');
            media.style.removeProperty('width');
        }
        const essayBox = item.querySelector('.essay-box');
        if (essayBox) {
            essayBox.style.removeProperty('height');
        }

        // Remove old span classes
        item.classList.remove('span-video', 'span-essay', 'span-tall', 'span-wide');

        gridContainer.appendChild(item);
    });

    // Run the Smart Justified Layout calculation
    // We run it immediately, but images might not be loaded yet, so we also wait for them.
    calculateJustifiedLayout();

    // Safety check: re-run layout once all images are definitely loaded
    Promise.all(Array.from(document.images).filter(img => !img.complete).map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))).then(() => {
        calculateJustifiedLayout();
    });
}

let resizeTimeout;
window.addEventListener('resize', () => {
    // Don't re-layout if we are looking at a photo (prevents background flash)
    if (document.querySelector('.is-focused')) return;

    if (document.querySelector('.gallery.return-to-form')) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(calculateJustifiedLayout, 50);
    } else {
        // Disco Mode Resize
        updatePhysicsBounds();
    }
});

// SMART JUSTIFIED LAYOUT ALGORITHM
function calculateJustifiedLayout() {
    const gallery = document.querySelector('.gallery.return-to-form');
    if (!gallery) return;

    const container = gallery.querySelector('.grid-container');
    if (!container) return;

    const items = Array.from(container.children);
    const containerWidth = container.clientWidth;
    const gap = 12; // Must match CSS gap

    let row = [];
    let currentAspectRatioSum = 0;

    // Random "Target Row Width" to creates variety. 
    // Standard is 100% of container.
    // We can vary the TARGET HEIGHT to achieve resizing.
    // A standard justified layout uses a fixed target height (e.g. 250px).
    // To add variety, we'll randomize the target height PER ROW decision.

    let targetRowHeight = 250; // default baseline

    items.forEach((item, index) => {
        // Determine Aspect Ratio of item
        let aspectRatio = 1; // Default square
        const media = item.querySelector('img, video, .thumbnail');
        const essay = item.querySelector('.essay-box');

        if (media && media.naturalWidth > 0) {
            aspectRatio = media.naturalWidth / media.naturalHeight;
        } else if (essay) {
            // Estimate essay aspect ratio based on width of text vs target height
            // Let's assume a wider ratio for the text tile to give it space
            aspectRatio = (essay.scrollWidth + 100) / 250;
        }

        // Add to row buffer
        row.push({ item, aspectRatio });
        currentAspectRatioSum += aspectRatio;

        // BOOST: If this item is vertical (artwork), force the row to aim MUCH higher
        // This makes vertical images significantly larger by reducing the number of items per row
        if (aspectRatio < 0.95) {
            if (targetRowHeight < 600) targetRowHeight = 600;
        }

        // Calculate potential width at target height
        // width = H * ar
        // Total row width = H * sum(ar) + (items-1)*gap
        const totalGap = (row.length - 1) * gap;
        const potentialRowWidth = (targetRowHeight * currentAspectRatioSum) + totalGap;

        // If this row is full enough (close to or exceeds container width)
        if (potentialRowWidth >= containerWidth || index === items.length - 1) {

            // Calculate EXACT Height needed to fill container width perfectly
            // containerWidth = H * sum(ar) + totalGap
            // H = (containerWidth - totalGap) / sum(ar)

            let finalHeight = (containerWidth - totalGap) / currentAspectRatioSum;

            // Cap height if it's too crazy tall (only happens on last row usually with few items)
            if (finalHeight > 700) finalHeight = 700; // Increased cap to allow tall artwork
            if (index === items.length - 1 && finalHeight > targetRowHeight) finalHeight = targetRowHeight; // Don't blow up last row

            // Apply height to all items in this row
            row.forEach(obj => {
                const el = obj.item.querySelector('img, video, .thumbnail');
                if (el) {
                    el.style.height = `${finalHeight}px`;
                    el.style.width = "auto";
                }
                const eb = obj.item.querySelector('.essay-box');
                if (eb) {
                    eb.style.height = `${finalHeight}px`;
                }
            });

            // Reset for next row
            row = [];
            currentAspectRatioSum = 0;

            // randomize next target height for "Edge" (Range 180px - 320px)
            targetRowHeight = Math.floor(Math.random() * (320 - 180 + 1)) + 180;
        }
    });
}

function loseForm() {
    startDiscoMode(); // NEW
    closeAll();

    const gallery = document.querySelector('.gallery');
    if (!gallery.classList.contains('return-to-form')) return;

    // Enable floating buttons
    const socialBtns = document.querySelectorAll('.social-btn');
    socialBtns.forEach(btn => btn.classList.add('floating'));

    // Move all items back to the gallery root
    const container = gallery.querySelector('.grid-container') || gallery.querySelector('.columns');

    if (container) {
        const items = container.querySelectorAll('.item');
        items.forEach(item => {
            gallery.appendChild(item);
            // Remove span classes
            item.classList.remove('span-video', 'span-essay', 'span-tall', 'span-wide');

            // Clean up randomized media sizes
            const media = item.querySelector('img, video, .thumbnail');
            if (media) {
                media.style.removeProperty('max-height');
                media.style.removeProperty('height');
                media.style.removeProperty('width');
                media.style.height = 'auto'; // Force auto to fix squishing
            }
            const essayBox = item.querySelector('.essay-box');
            if (essayBox) {
                essayBox.style.removeProperty('height');
                essayBox.style.height = 'auto';
            }
        });
        container.remove();
    }

    gallery.classList.remove('return-to-form');
    void gallery.offsetWidth; // Force Reflow to ensure item dimensions are correct before physics
    scrambleItems();
}




