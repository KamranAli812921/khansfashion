const API_URL = window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:5000';

class AuraApp {
  constructor() {
    this.state = {
      user: JSON.parse(localStorage.getItem('aura_user')) || null,
      accessToken: localStorage.getItem('aura_access_token') || null,
      refreshToken: localStorage.getItem('aura_refresh_token') || null,
      cart: JSON.parse(localStorage.getItem('aura_cart')) || [],
      categories: [],
      allCategories: [],
      products: [],
      currentPage: 1,
      itemsPerPage: 20,
      adminSettings: { bankAccounts: [] },
      currentFilters: {
        category: 'all',
        search: '',
        isOnSale: false
      },
      categoriesExpanded: false,
      currentAdminTab: 'overview',
      activeProduct: null, // For details modal
      adminImages: [],
      adminVideos: [],
      adminOrders: []
    };
  }

  init() {
    console.log('Aura App initializing...');
    
    // Set up auth state UI
    this.updateAuthNavUI();
    
    // Route to correct view based on URL Hash
    const hash = window.location.hash.replace('#', '') || 'browse';
    this.showView(hash);

    // Check if URL has ?trackOrder=OrderId (e.g. from QR scan)
    const urlParams = new URLSearchParams(window.location.search);
    const trackOrder = urlParams.get('trackOrder');
    if (trackOrder) {
      window.history.replaceState({}, document.title, window.location.origin + window.location.hash);
      setTimeout(() => {
        const input = document.getElementById('tracking-search-id');
        if (input) {
          input.value = trackOrder;
          this.showView('tracking');
          this.searchOrder();
        }
      }, 300);
    }

    // Check if URL has ?viewProduct=ProductId (e.g. from invoice link click)
    const viewProduct = urlParams.get('viewProduct');
    if (viewProduct) {
      window.history.replaceState({}, document.title, window.location.origin + window.location.hash);
      setTimeout(() => {
        this.openProductModal(viewProduct);
      }, 300);
    }

    // Initial API fetches
    this.fetchCategories();
    this.fetchProducts();
    this.fetchAdminSettingsPublic();

    // Listen to hash changes for simple routing
    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '') || 'browse';
      this.showView(newHash);
    });

    // Populate initial cart count
    this.updateCartCountUI();

    // Setup input listeners for realtime filtering
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });

    // Dynamic click listeners for header navigation to prevent inline script failures
    const navLinksMap = {
      'nav-browse': () => this.showView('browse'),
      'nav-cart': () => this.showView('cart'),
      'nav-tracking': () => this.showView('tracking'),
      'nav-profile': () => this.showView('profile'),
      'nav-admin': () => this.showView('admin'),
      'nav-auth': () => this.showView('auth'),
      'nav-logout': () => this.logout()
    };

    Object.entries(navLinksMap).forEach(([id, handler]) => {
      const parentLi = document.getElementById(id);
      if (parentLi) {
        const link = parentLi.querySelector('a');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            handler();
            // Close mobile menu drawer on transition
            const hamburgerBtn = document.getElementById('hamburger-menu-btn');
            const navLinks = document.querySelector('.nav-links');
            if (hamburgerBtn) hamburgerBtn.classList.remove('active');
            if (navLinks) navLinks.classList.remove('active');
          });
        }
      }
    });

    // Bind hamburger menu button toggle
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (hamburgerBtn && navLinks) {
      hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburgerBtn.classList.toggle('active');
        navLinks.classList.toggle('active');
      });

      // Close menu if clicking outside
      document.addEventListener('click', (e) => {
        if (!hamburgerBtn.contains(e.target) && !navLinks.contains(e.target)) {
          hamburgerBtn.classList.remove('active');
          navLinks.classList.remove('active');
        }
      });
    }

    // Bind logo click
    const logoLink = document.getElementById('logo-link');
    if (logoLink) {
      logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showView('browse');
        // Close mobile menu drawer on logo click
        const hamburgerBtn = document.getElementById('hamburger-menu-btn');
        const navLinks = document.querySelector('.nav-links');
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        if (navLinks) navLinks.classList.remove('active');
      });
    }

    // Helper to read file as base64
    const readFileAsDataURL = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    };

    // Listen to admin product image files upload
    const imageFilesInput = document.getElementById('admin-product-image-files');
    if (imageFilesInput) {
      imageFilesInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
          const base64 = await readFileAsDataURL(file);
          this.state.adminImages.push(base64);
        }
        e.target.value = '';
        this.renderAdminMediaPreviews();
      });
    }

    // Listen to admin product video files upload
    const videoFilesInput = document.getElementById('admin-product-video-files');
    if (videoFilesInput) {
      videoFilesInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
          const base64 = await readFileAsDataURL(file);
          this.state.adminVideos.push(base64);
        }
        e.target.value = '';
        this.renderAdminMediaPreviews();
      });
    }
  }

  // --- API HELPER WRAPPER ---
  async apiFetch(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    
    // Set default headers
    options.headers = options.headers || {};
    if (!(options.body instanceof FormData)) {
      options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    }
    
    // Add auth token if present
    if (this.state.accessToken) {
      options.headers['Authorization'] = `Bearer ${this.state.accessToken}`;
    }

    try {
      let response = await fetch(url, options);

      // Handle 403 / 401 token expiry (potential token refresh logic)
      if (response.status === 403 && this.state.accessToken) {
        console.warn('Access token expired. Standard logout or refresh needed.');
        // Simple logout for MVP if refresh fails or is expired
        this.logout();
        this.showAlert('Session expired. Please log in again.', 'rose-gold');
        return null;
      }

      return response;
    } catch (err) {
      console.error(`Fetch error on ${endpoint}:`, err);
      this.showAlert('Network connection error. Check backend status.', 'rose-gold');
      throw err;
    }
  }

  // --- ALERT NOTIFICATION SYSTEM ---
  showAlert(message, type = 'gold', duration = 4000) {
    const banner = document.getElementById('alert-banner');
    banner.innerText = message;
    banner.style.display = 'block';
    
    // Set background color based on brand tokens
    if (type === 'gold') {
      banner.style.backgroundColor = '#C9A227';
      banner.style.color = '#0D0D0D';
    } else if (type === 'rose-gold') {
      banner.style.backgroundColor = '#B76E79';
      banner.style.color = '#F5F2ED';
    } else if (type === 'success') {
      banner.style.backgroundColor = '#28a745';
      banner.style.color = '#F5F2ED';
    } else {
      banner.style.backgroundColor = '#1A1A1A';
      banner.style.color = '#8A8A8A';
    }

    setTimeout(() => {
      banner.style.display = 'none';
    }, duration);
  }

  // --- ROUTER VIEW CHANGER ---
  showView(viewName) {
    if (viewName && viewName.startsWith('product-')) {
      const prodId = viewName.replace('product-', '');
      this.showView('browse');
      setTimeout(() => {
        this.openQuickActionModal(prodId);
      }, 500);
      return;
    }

    // Auth gates
    if (viewName === 'admin' && (!this.state.user || this.state.user.role !== 'admin')) {
      this.showAlert('Admin credentials required.', 'rose-gold');
      this.showView('auth');
      return;
    }
    if (this.state.user && this.state.user.role === 'admin') {
      if (viewName === 'cart' || viewName === 'profile' || viewName === 'checkout' || viewName === 'tracking') {
        this.showAlert('Admins do not have access to client shopping views.', 'rose-gold');
        this.showView('admin');
        return;
      }
    }
    if (viewName === 'profile' && !this.state.user) {
      this.showView('auth');
      return;
    }
    if (viewName === 'checkout' && !this.state.user) {
      this.showAlert('Please sign in to proceed to checkout.', 'gold');
      this.showView('auth');
      return;
    }

    // Toggle active classes on view sections
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(sec => sec.classList.remove('active'));

    // Toggle admin mode styling class on body
    if (viewName === 'admin') {
      document.body.classList.add('admin-mode');
    } else {
      document.body.classList.remove('admin-mode');
    }

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add('active');
      window.location.hash = viewName;
    } else {
      // Fallback
      document.getElementById('view-browse').classList.add('active');
      window.location.hash = 'browse';
    }

    // View specific hooks
    if (viewName === 'cart') this.renderCart();
    if (viewName === 'profile') this.loadProfileData();
    if (viewName === 'checkout') this.loadCheckoutForm();
    if (viewName === 'admin') this.loadAdminDashboard();

    // Toggle WhatsApp support link visibility based on active view name
    this.updateWhatsAppFAB();
  }

  // --- AUTH SECTION ---
  updateAuthNavUI() {
    const navAuth = document.getElementById('nav-auth');
    const navLogout = document.getElementById('nav-logout');
    const navAdmin = document.getElementById('nav-admin');
    const navProfile = document.getElementById('nav-profile');
    const navCart = document.getElementById('nav-cart');
    const navTracking = document.getElementById('nav-tracking');

    if (this.state.user) {
      navAuth.style.display = 'none';
      navLogout.style.display = 'block';
      
      if (this.state.user.role === 'admin') {
        navAdmin.style.display = 'block';
        if (navProfile) navProfile.style.display = 'none';
        if (navCart) navCart.style.display = 'none';
        if (navTracking) navTracking.style.display = 'none';
      } else {
        navAdmin.style.display = 'none';
        if (navProfile) navProfile.style.display = 'block';
        if (navCart) navCart.style.display = 'block';
        if (navTracking) navTracking.style.display = 'block';
      }
    } else {
      navAuth.style.display = 'block';
      navLogout.style.display = 'none';
      navAdmin.style.display = 'none';
      if (navProfile) navProfile.style.display = 'none';
      if (navCart) navCart.style.display = 'block';
      if (navTracking) navTracking.style.display = 'block';
    }
  }

  toggleAuthForm(type) {
    const loginCard = document.getElementById('auth-login-card');
    const signupCard = document.getElementById('auth-signup-card');
    const otpCard = document.getElementById('auth-otp-card');

    loginCard.style.display = type === 'login' ? 'block' : 'none';
    signupCard.style.display = type === 'signup' ? 'block' : 'none';
    otpCard.style.display = type === 'otp' ? 'block' : 'none';
  }

  togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.classList.toggle('active', !showing);
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    btn.innerHTML = showing
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  }

  async handleSignup(e) {
    e.preventDefault();
    const firstName = document.getElementById('signup-first-name').value;
    const lastName = document.getElementById('signup-last-name').value;
    const email = document.getElementById('signup-email').value;
    const phone = document.getElementById('signup-phone').value;
    const password = document.getElementById('signup-password').value;
    const street = document.getElementById('signup-street').value;
    const area = document.getElementById('signup-area').value;
    const city = document.getElementById('signup-city').value;

    const payload = {
      firstName,
      lastName,
      email,
      phone,
      password,
      address: { street, area, city }
    };

    try {
      const res = await this.apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.status === 201) {
        this.showAlert(data.message, 'gold');
        document.getElementById('otp-target-email').innerText = email;
        this.toggleAuthForm('otp');
      } else {
        this.showAlert(data.message || 'Signup failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Signup error occurred.', 'rose-gold');
    }
  }

  async handleOTPVerify(e) {
    e.preventDefault();
    const email = document.getElementById('otp-target-email').innerText || document.getElementById('signup-email').value;
    const otp = document.getElementById('otp-code').value;

    try {
      const res = await this.apiFetch('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();

      if (res.status === 200) {
        this.showAlert(data.message, 'success');
        this.saveAuth(data.user, data.accessToken, data.refreshToken);
        this.showView('browse');
      } else {
        this.showAlert(data.message || 'OTP verification failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Verification error.', 'rose-gold');
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await this.apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.status === 200) {
        this.showAlert(data.message, 'success');
        this.saveAuth(data.user, data.accessToken, data.refreshToken);
        this.showView('browse');
      } else if (res.status === 403 && data.isVerified === false) {
        // Account unverified, redirected to OTP verification
        this.showAlert(data.message, 'gold');
        document.getElementById('otp-target-email').innerText = email;
        this.toggleAuthForm('otp');
      } else {
        this.showAlert(data.message || 'Login failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Login error.', 'rose-gold');
    }
  }

  async resendOTP() {
    const email = document.getElementById('otp-target-email').innerText;
    if (!email) return;

    try {
      const res = await this.apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Resend',
          lastName: 'Request',
          email,
          phone: '00000000000',
          password: 'dummy' // backend logic finds existing unverified and recreates OTP
        })
      });
      if (res.status === 201) {
        this.showAlert('Verification code resent.', 'gold');
      }
    } catch (err) {
      this.showAlert('Resend failed.', 'rose-gold');
    }
  }

  saveAuth(user, accessToken, refreshToken) {
    this.state.user = user;
    this.state.accessToken = accessToken;
    this.state.refreshToken = refreshToken;

    localStorage.setItem('aura_user', JSON.stringify(user));
    localStorage.setItem('aura_access_token', accessToken);
    localStorage.setItem('aura_refresh_token', refreshToken);

    this.updateAuthNavUI();
    this.syncCartBackend();
  }

  logout() {
    this.state.user = null;
    this.state.accessToken = null;
    this.state.refreshToken = null;
    this.state.cart = [];

    localStorage.removeItem('aura_user');
    localStorage.removeItem('aura_access_token');
    localStorage.removeItem('aura_refresh_token');
    localStorage.removeItem('aura_cart');

    this.updateAuthNavUI();
    this.updateCartCountUI();
    this.showView('browse');
    this.showAlert('Logged out successfully.', 'stone');
  }

  // --- BROWSE / PRODUCT INVENTORY FLOW ---
  async fetchCategories() {
    try {
      // 1. Fetch storefront categories (only those with products)
      const res = await this.apiFetch('/categories?hasProducts=true');
      if (res && res.status === 200) {
        this.state.categories = await res.json();
        this.renderCategoriesFilter();
      }

      // 2. Fetch all categories (for admin product forms & listings)
      const resAll = await this.apiFetch('/categories');
      if (resAll && resAll.status === 200) {
        this.state.allCategories = await resAll.json();
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }

  async fetchProducts() {
    try {
      let queryParams = `?category=${encodeURIComponent(this.state.currentFilters.category)}&search=${encodeURIComponent(this.state.currentFilters.search)}`;
      if (this.state.currentFilters.isOnSale) {
        queryParams += `&isOnSale=true`;
      }
      
      const res = await this.apiFetch(`/products${queryParams}`);
      if (res && res.status === 200) {
        this.state.products = await res.json();
        this.renderProducts();
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }

  renderCategoriesFilter() {
    const list = document.getElementById('category-filter-list');
    // Keep first item
    list.innerHTML = `<li class="filter-item ${this.state.currentFilters.category === 'all' ? 'active' : ''}" data-category="all" onclick="app.filterCategory('all')">All Products</li>`;

    const VISIBLE_LIMIT = 4;
    const hasMore = this.state.categories.length > VISIBLE_LIMIT;
    const categoriesToShow = (this.state.categoriesExpanded || !hasMore)
      ? this.state.categories
      : this.state.categories.slice(0, VISIBLE_LIMIT);

    categoriesToShow.forEach(cat => {
      const activeClass = this.state.currentFilters.category === cat.slug ? 'active' : '';
      list.innerHTML += `<li class="filter-item ${activeClass}" data-category="${cat.slug}" onclick="app.filterCategory('${cat.slug}')">${cat.name}</li>`;
    });

    if (hasMore) {
      list.innerHTML += `<li class="filter-item filter-toggle" onclick="app.toggleCategoriesExpanded()">${this.state.categoriesExpanded ? 'See Less' : 'See More Categories'}</li>`;
    }
  }

  toggleCategoriesExpanded() {
    this.state.categoriesExpanded = !this.state.categoriesExpanded;
    this.renderCategoriesFilter();
  }

  filterCategory(categorySlug) {
    this.state.currentFilters.category = categorySlug;
    this.renderCategoriesFilter();
    this.state.currentPage = 1;
    this.fetchProducts();
  }

  filterSale(saleOnly) {
    this.state.currentFilters.isOnSale = saleOnly;
    document.getElementById('filter-all-offers').classList.toggle('active', !saleOnly);
    document.getElementById('filter-sale-offers').classList.toggle('active', saleOnly);
    this.state.currentPage = 1;
    this.fetchProducts();
  }

  handleSearch() {
    this.state.currentFilters.search = document.getElementById('search-input').value.trim();
    this.state.currentPage = 1;
    this.fetchProducts();
  }

  renderProducts() {
    const grid = document.getElementById('products-grid-container');
    const paginationContainer = document.getElementById('products-pagination-container');
    
    if (this.state.products.length === 0) {
      grid.innerHTML = `<div style="grid-column: span 4; text-align: center; color: var(--stone); padding: 4rem 0;">No products found.</div>`;
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(this.state.products.length / this.state.itemsPerPage);
    if (this.state.currentPage > totalPages) {
      this.state.currentPage = totalPages || 1;
    }

    const startIndex = (this.state.currentPage - 1) * this.state.itemsPerPage;
    const paginatedProducts = this.state.products.slice(startIndex, startIndex + this.state.itemsPerPage);

    grid.innerHTML = '';
    paginatedProducts.forEach(prod => {
      const displayPrice = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
      const saleBadge = prod.isOnSale ? `<span class="sale-badge">Sale</span>` : '';
      const originalPriceText = prod.isOnSale && prod.discountPrice ? `<span class="original-price">PKR ${prod.price.toLocaleString()}</span>` : '';

      grid.innerHTML += `
        <div class="product-card" onclick="app.openQuickActionModal('${prod._id}')">
          <div class="product-image-container">
            ${saleBadge}
            <img src="${prod.images[0] || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600'}" alt="${prod.name}" class="product-image">
          </div>
          <div class="product-info">
            <span class="product-category">${prod.category}</span>
            <h4 class="product-name signature-underline">${prod.name}</h4>
            <div class="product-price-container">
              <span class="product-price">PKR ${displayPrice.toLocaleString()}</span>
              ${originalPriceText}
            </div>
          </div>
        </div>
      `;
    });

    // Render pagination controls
    if (paginationContainer) {
      paginationContainer.innerHTML = '';
      if (totalPages <= 1) return;

      // Prev Button
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-stone';
      prevBtn.style.padding = '0.4rem 0.8rem';
      prevBtn.style.fontSize = '0.85rem';
      prevBtn.innerText = 'Prev';
      prevBtn.disabled = this.state.currentPage === 1;
      prevBtn.onclick = () => {
        this.state.currentPage--;
        this.renderProducts();
        document.getElementById('products-grid-container').scrollIntoView({ behavior: 'smooth' });
      };
      paginationContainer.appendChild(prevBtn);

      // Numeric Buttons
      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn ${this.state.currentPage === i ? 'btn-primary' : 'btn-stone'}`;
        pageBtn.style.padding = '0.4rem 0.8rem';
        pageBtn.style.fontSize = '0.85rem';
        pageBtn.innerText = i;
        pageBtn.onclick = () => {
          this.state.currentPage = i;
          this.renderProducts();
          document.getElementById('products-grid-container').scrollIntoView({ behavior: 'smooth' });
        };
        paginationContainer.appendChild(pageBtn);
      }

      // Next Button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-stone';
      nextBtn.style.padding = '0.4rem 0.8rem';
      nextBtn.style.fontSize = '0.85rem';
      nextBtn.innerText = 'Next';
      nextBtn.disabled = this.state.currentPage === totalPages;
      nextBtn.onclick = () => {
        this.state.currentPage++;
        this.renderProducts();
        document.getElementById('products-grid-container').scrollIntoView({ behavior: 'smooth' });
      };
      paginationContainer.appendChild(nextBtn);
    }
  }

  selectProductSize(btn, size) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.state.selectedSize = size;
  }

  selectProductColor(btn, color) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.state.selectedColor = color;
  }

  handleModalSizePriceChange(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const size = selectedOption.value;
    
    this.state.selectedSize = size || null;
    
    const priceTextContainer = document.querySelector('.product-price-container');
    if (!priceTextContainer) return;
    
    if (!size) {
      const prod = this.state.activeProduct;
      const displayPrice = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
      const originalPriceText = prod.isOnSale && prod.discountPrice ? `<span class="original-price">PKR ${prod.price.toLocaleString()}</span>` : '';
      priceTextContainer.innerHTML = `
        <span class="product-price" style="font-weight: 700;">PKR ${displayPrice.toLocaleString()}</span>
        ${originalPriceText}
      `;
      return;
    }
    
    const price = parseFloat(selectedOption.dataset.price);
    const discountPriceVal = selectedOption.dataset.discount;
    const discountPrice = discountPriceVal ? parseFloat(discountPriceVal) : null;
    
    const displayPrice = discountPrice || price;
    const originalPriceText = discountPrice ? `<span class="original-price">PKR ${price.toLocaleString()}</span>` : '';
    
    priceTextContainer.innerHTML = `
      <span class="product-price" style="font-weight: 700;">PKR ${displayPrice.toLocaleString()}</span>
      ${originalPriceText}
    `;
  }

  handleQuickSizePriceChange(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const size = selectedOption.value;
    
    this.state.selectedSize = size || null;
    
    const priceEl = document.getElementById('quick-action-price-display');
    if (!priceEl) return;
    
    if (!size) {
      const prod = this.state.activeProduct;
      const displayPrice = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
      priceEl.innerText = `PKR ${displayPrice.toLocaleString()}`;
      return;
    }
    
    const price = parseFloat(selectedOption.dataset.price);
    const discountPriceVal = selectedOption.dataset.discount;
    const discountPrice = discountPriceVal ? parseFloat(discountPriceVal) : null;
    
    const displayPrice = discountPrice || price;
    priceEl.innerText = `PKR ${displayPrice.toLocaleString()}`;
  }

  // --- QUICK ACTION DIALOG ---
  openQuickActionModal(productId) {
    const prod = this.state.products.find(p => p._id === productId);
    if (!prod) return;

    // If admin is logged in, directly open details modal and bypass checkout choices
    if (this.state.user && this.state.user.role === 'admin') {
      this.openProductModal(productId);
      return;
    }

    this.state.activeProduct = prod;
    this.state.selectedSize = null;
    this.state.selectedColor = null;

    const modal = document.getElementById('product-quick-action-modal');
    const container = document.getElementById('modal-quick-action-container');

    const displayPrice = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;

    let sizesHTML = '';
    if (prod.sizePrices && prod.sizePrices.length > 0) {
      sizesHTML = `
        <div style="margin-bottom: 1rem; text-align: left;">
          <span style="font-weight:600; font-size:0.8rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Size</span>
          <select id="quick-product-size-select" class="form-input" style="padding: 0.5rem;" onchange="app.handleQuickSizePriceChange(this)">
            <option value="">-- Choose Size --</option>
            ${prod.sizePrices.map(sp => {
              const displayP = sp.discountPrice || sp.price;
              const hasDiscount = !!sp.discountPrice;
              const priceText = hasDiscount 
                ? `PKR ${sp.discountPrice.toLocaleString()} (Was PKR ${sp.price.toLocaleString()})`
                : `PKR ${sp.price.toLocaleString()}`;
              return `<option value="${sp.size}" data-price="${sp.price}" data-discount="${sp.discountPrice || ''}">${sp.size} - ${priceText}</option>`;
            }).join('')}
          </select>
        </div>
      `;
    } else if (prod.sizes && prod.sizes.length > 0) {
      sizesHTML = `
        <div style="margin-bottom: 1rem; text-align: left;">
          <span style="font-weight:600; font-size:0.8rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Size</span>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            ${prod.sizes.map(s => `
              <button type="button" class="btn-attr size-btn" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="app.selectProductSize(this, '${s}')">${s}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    let colorsHTML = '';
    if (prod.colors && prod.colors.length > 0) {
      colorsHTML = `
        <div style="margin-bottom: 1.25rem; text-align: left;">
          <span style="font-weight:600; font-size:0.8rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Color</span>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            ${prod.colors.map(c => `
              <button type="button" class="btn-attr color-btn" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="app.selectProductColor(this, '${c}')">${c}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="margin-bottom: 1.5rem; text-align: center;">
        <img src="${prod.images[0] || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600'}" alt="${prod.name}" style="width: 120px; height: 120px; object-fit: cover; margin: 0 auto 1rem; display: block; border-radius: 0; border: 1px solid rgba(245,242,237,0.1);">
        <h3 style="font-family: var(--font-display); font-size: 1.6rem; color: var(--ivory); margin-bottom: 0.5rem; text-align: center;">${prod.name}</h3>
        <p id="quick-action-price-display" style="color: var(--gold); font-weight: 600; font-size: 1.1rem; text-align: center; font-family: var(--font-body);">PKR ${displayPrice.toLocaleString()}</p>
      </div>
      
      <p style="font-size: 0.9rem; color: var(--stone); margin-bottom: 1.5rem; text-align: center;">Choose size, color & action to proceed:</p>
      
      ${sizesHTML}
      ${colorsHTML}
      
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <button class="btn btn-primary" onclick="app.quickOrder('${prod._id}')" style="width: 100%;">Order now</button>
        <button class="btn btn-secondary" onclick="app.quickAddToCart('${prod._id}')" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <span>Cart</span>
        </button>
        <button class="btn btn-stone" onclick="app.quickViewDetails('${prod._id}')" style="width: 100%; border-color: rgba(245,242,237,0.1); color: var(--ivory);">View Product Details</button>
      </div>
    `;

    modal.classList.add('active');
  }

  closeQuickActionModal() {
    document.getElementById('product-quick-action-modal').classList.remove('active');
  }

  quickOrder(productId) {
    const prod = this.state.products.find(p => p._id === productId);
    if (!prod) return;

    const hasSizes = (prod.sizes && prod.sizes.length > 0) || (prod.sizePrices && prod.sizePrices.length > 0);
    if (hasSizes && !this.state.selectedSize) {
      this.showAlert('Please select a size.', 'rose-gold');
      return;
    }
    if (prod.colors && prod.colors.length > 0 && !this.state.selectedColor) {
      this.showAlert('Please select a color.', 'rose-gold');
      return;
    }

    const size = this.state.selectedSize || null;
    const color = this.state.selectedColor || null;

    this.closeQuickActionModal();

    const existingItem = this.state.cart.find(item => item.productId === prod._id && item.size === size && item.color === color);
    if (existingItem) {
      existingItem.qty++;
    } else {
      let price = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
      if (prod.sizePrices && prod.sizePrices.length > 0 && size) {
        const matchingSizePrice = prod.sizePrices.find(sp => sp.size === size);
        if (matchingSizePrice) {
          price = matchingSizePrice.discountPrice || matchingSizePrice.price;
        }
      }
      this.state.cart.push({
        productId: prod._id,
        name: prod.name,
        qty: 1,
        price: price,
        size,
        color,
        image: prod.images[0] || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600'
      });
    }

    localStorage.setItem('aura_cart', JSON.stringify(this.state.cart));
    this.updateCartCountUI();
    this.syncCartBackend();

    this.state.selectedSize = null;
    this.state.selectedColor = null;

    this.showView('checkout');
  }

  quickAddToCart(productId) {
    const prod = this.state.products.find(p => p._id === productId);
    if (!prod) return;

    if (prod.sizes && prod.sizes.length > 0 && !this.state.selectedSize) {
      this.showAlert('Please select a size.', 'rose-gold');
      return;
    }
    if (prod.colors && prod.colors.length > 0 && !this.state.selectedColor) {
      this.showAlert('Please select a color.', 'rose-gold');
      return;
    }

    this.closeQuickActionModal();
    this.addToCart(productId);
  }

  quickViewDetails(productId) {
    this.closeQuickActionModal();
    this.openProductModal(productId);
  }

  // --- DETAILS MODAL ---
  async openProductModal(productId) {
    let prod = this.state.products.find(p => p._id === productId);
    if (!prod) {
      try {
        const res = await this.apiFetch(`/products/${productId}`);
        if (res && res.status === 200) {
          prod = await res.json();
        }
      } catch (err) {
        console.error('Failed to load product details for modal:', err);
      }
    }
    if (!prod) return;

    this.state.activeProduct = prod;
    this.state.selectedSize = null;
    this.state.selectedColor = null;

    const modal = document.getElementById('product-detail-modal');
    const container = document.getElementById('modal-product-detail-container');

    const displayPrice = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
    const saleBadge = prod.isOnSale ? `<span class="sale-badge" style="position:static; margin-bottom: 0.5rem; display:inline-block;">Sale</span>` : '';
    const originalPriceText = prod.isOnSale && prod.discountPrice ? `<span class="original-price">PKR ${prod.price.toLocaleString()}</span>` : '';

    // Combine images and videos into single array
    const mediaItems = [];
    if (prod.images && prod.images.length > 0) {
      prod.images.forEach(img => {
        if (img) mediaItems.push({ type: 'image', url: img });
      });
    }
    if (prod.videos && prod.videos.length > 0) {
      prod.videos.forEach(vid => {
        if (vid) mediaItems.push({ type: 'video', url: vid });
      });
    }
    // Fallback if empty
    if (mediaItems.length === 0) {
      mediaItems.push({ type: 'image', url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600' });
    }

    this.state.sliderIndex = 0;
    this.state.sliderMedia = mediaItems;

    let sliderControlsHTML = '';
    if (mediaItems.length > 1) {
      sliderControlsHTML = `
        <button class="slider-btn slider-btn-left" onclick="app.slidePrev()">&lsaquo;</button>
        <button class="slider-btn slider-btn-right" onclick="app.slideNext()">&rsaquo;</button>
        <div class="slider-dots">
          ${mediaItems.map((_, i) => `<span class="slider-dot ${i === 0 ? 'active' : ''}" onclick="app.slideGo(${i})"></span>`).join('')}
        </div>
      `;
    }

    const mediaHTML = `
      <div class="slider-container">
        <div class="slider-track" id="detail-slider-track" style="transform: translateX(0%);">
          ${mediaItems.map((item, idx) => `
            <div class="slider-slide">
              ${item.type === 'image' 
                ? `<img src="${item.url}" alt="${prod.name}">` 
                : `<video src="${item.url}" controls ${idx === 0 ? 'autoplay' : ''} muted loop playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>`
              }
            </div>
          `).join('')}
        </div>
        ${sliderControlsHTML}
      </div>
    `;

    let sizesHTML = '';
    if (prod.sizePrices && prod.sizePrices.length > 0) {
      sizesHTML = `
        <div style="margin-bottom: 1.25rem;">
          <span style="font-weight:600; font-size:0.85rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Size</span>
          <select id="modal-product-size-select" class="form-input" style="padding: 0.5rem;" onchange="app.handleModalSizePriceChange(this)">
            <option value="">-- Choose Size --</option>
            ${prod.sizePrices.map(sp => {
              const displayP = sp.discountPrice || sp.price;
              const hasDiscount = !!sp.discountPrice;
              const priceText = hasDiscount 
                ? `PKR ${sp.discountPrice.toLocaleString()} (Was PKR ${sp.price.toLocaleString()})`
                : `PKR ${sp.price.toLocaleString()}`;
              return `<option value="${sp.size}" data-price="${sp.price}" data-discount="${sp.discountPrice || ''}">${sp.size} - ${priceText}</option>`;
            }).join('')}
          </select>
        </div>
      `;
    } else if (prod.sizes && prod.sizes.length > 0) {
      sizesHTML = `
        <div style="margin-bottom: 1.25rem;">
          <span style="font-weight:600; font-size:0.85rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Size</span>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${prod.sizes.map(s => `
              <button type="button" class="btn-attr size-btn" onclick="app.selectProductSize(this, '${s}')">${s}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    let colorsHTML = '';
    if (prod.colors && prod.colors.length > 0) {
      colorsHTML = `
        <div style="margin-bottom: 1.5rem;">
          <span style="font-weight:600; font-size:0.85rem; color:var(--gold); display:block; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;">Select Color</span>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${prod.colors.map(c => `
              <button type="button" class="btn-attr color-btn" onclick="app.selectProductColor(this, '${c}')">${c}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="product-detail-grid">
        <div class="product-detail-media">
          ${mediaHTML}
        </div>
        <div class="product-detail-info">
          <span class="product-category" style="margin-bottom: 0.25rem;">${prod.category}</span>
          ${saleBadge}
          <h2 style="font-family: var(--font-display); font-size: 2rem; color: var(--ivory); line-height: 1.2; margin-bottom: 0.75rem;">${prod.name}</h2>
          
          <div class="product-price-container" style="font-size: 1.3rem; margin-bottom: 1.5rem;">
            <span class="product-price" style="font-weight: 700;">PKR ${displayPrice.toLocaleString()}</span>
            ${originalPriceText}
          </div>

          <p class="product-detail-desc">${prod.description}</p>

          ${sizesHTML}
          ${colorsHTML}

          <div style="margin-top: auto; display: flex; gap: 1rem;">
            ${!(this.state.user && this.state.user.role === 'admin') ? `<button class="btn btn-primary" onclick="app.addToCart('${prod._id}')" style="flex-grow: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span>Cart</span>
            </button>` : ''}
            <button class="btn btn-secondary" onclick="app.closeProductModal()" style="flex-grow: 1;">Continue Shopping</button>
          </div>
        </div>
      </div>

      <!-- Product Reviews Board -->
      <div style="margin-top: 3rem; border-top: 1px solid rgba(245,242,237,0.1); padding-top: 2rem; text-align: left;">
        <h3 style="font-family: var(--font-display); font-size: 1.4rem; color: var(--gold); margin-bottom: 1.5rem;">Customer Reviews</h3>
        
        <!-- Review Submission Card -->
        <div id="product-review-form-container" style="display: none; background: #121212; padding: 1.5rem; border: 1px solid rgba(245,242,237,0.05); margin-bottom: 2rem;">
          <h4 style="font-family: var(--font-body); font-size: 1rem; color: var(--ivory); margin-bottom: 1rem; font-weight:600;">Leave a Review</h4>
          <form onsubmit="app.handleReviewSubmit(event, '${prod._id}')">
            <div class="form-row" style="margin-bottom: 1rem; align-items: center; gap: 1rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Rating</label>
                <select id="review-rating-input" class="form-input" style="max-width: 150px; padding: 0.4rem;" required>
                  <option value="5">⭐⭐⭐⭐&nbsp;(5/5)</option>
                  <option value="4">⭐⭐⭐⭐ (4/5)</option>
                  <option value="3">⭐⭐⭐ (3/5)</option>
                  <option value="2">⭐⭐ (2/5)</option>
                  <option value="1">⭐ (1/5)</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Your Review</label>
              <textarea id="review-comment-input" class="form-input" rows="2" placeholder="Share your experience with this item..." required></textarea>
            </div>
            <button type="submit" class="btn btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.75rem;">Submit Review</button>
          </form>
        </div>

        <div id="product-review-guest-notice" style="display: none; text-align: center; padding: 1.5rem; background: #121212; border: 1px dashed rgba(245,242,237,0.1); margin-bottom: 2rem; font-size: 0.85rem; color: var(--stone);">
          Please <a href="javascript:void(0)" onclick="app.closeProductModal(); app.showView('auth');" style="color: var(--gold); text-decoration: underline;">Sign In</a> to share your feedback for this product.
        </div>

        <!-- Reviews List -->
        <div id="product-reviews-list" style="display: flex; flex-direction: column; gap: 1rem;">
          <!-- Loaded dynamically -->
        </div>
      </div>
    `;

    // Trigger reviews logic loading
    this.loadProductReviews(prod._id);

    modal.classList.add('active');
  }

  slideNext() {
    if (!this.state.sliderMedia || this.state.sliderMedia.length <= 1) return;
    this.state.sliderIndex = (this.state.sliderIndex + 1) % this.state.sliderMedia.length;
    this.updateSliderUI();
  }

  slidePrev() {
    if (!this.state.sliderMedia || this.state.sliderMedia.length <= 1) return;
    this.state.sliderIndex = (this.state.sliderIndex - 1 + this.state.sliderMedia.length) % this.state.sliderMedia.length;
    this.updateSliderUI();
  }

  slideGo(index) {
    this.state.sliderIndex = index;
    this.updateSliderUI();
  }

  updateSliderUI() {
    const track = document.getElementById('detail-slider-track');
    if (!track) return;

    const offset = -this.state.sliderIndex * 100;
    track.style.transform = `translateX(${offset}%)`;

    const dots = document.querySelectorAll('.slider-dots .slider-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === this.state.sliderIndex);
    });

    const slides = document.querySelectorAll('.slider-slide');
    slides.forEach((slide, idx) => {
      const video = slide.querySelector('video');
      if (video) {
        if (idx === this.state.sliderIndex) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  }

  closeProductModal() {
    document.getElementById('product-detail-modal').classList.remove('active');
    this.state.activeProduct = null;
    this.state.sliderMedia = null;
  }

  // --- CART MANAGEMENT ---
  addToCart(productId) {
    const prod = this.state.products.find(p => p._id === productId) || this.state.activeProduct;
    if (!prod) return;

    const hasSizes = (prod.sizes && prod.sizes.length > 0) || (prod.sizePrices && prod.sizePrices.length > 0);
    if (hasSizes && !this.state.selectedSize) {
      this.showAlert('Please select a size.', 'rose-gold');
      return;
    }
    if (prod.colors && prod.colors.length > 0 && !this.state.selectedColor) {
      this.showAlert('Please select a color.', 'rose-gold');
      return;
    }

    const size = this.state.selectedSize || null;
    const color = this.state.selectedColor || null;

    const existingItem = this.state.cart.find(item => item.productId === prod._id && item.size === size && item.color === color);

    if (existingItem) {
      existingItem.qty++;
    } else {
      let price = prod.isOnSale && prod.discountPrice ? prod.discountPrice : prod.price;
      if (prod.sizePrices && prod.sizePrices.length > 0 && size) {
        const matchingSizePrice = prod.sizePrices.find(sp => sp.size === size);
        if (matchingSizePrice) {
          price = matchingSizePrice.discountPrice || matchingSizePrice.price;
        }
      }
      this.state.cart.push({
        productId: prod._id,
        name: prod.name,
        qty: 1,
        price: price,
        size,
        color,
        image: prod.images[0] || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600'
      });
    }

    // Reset selection state
    this.state.selectedSize = null;
    this.state.selectedColor = null;

    localStorage.setItem('aura_cart', JSON.stringify(this.state.cart));
    this.updateCartCountUI();
    this.syncCartBackend();
    this.showAlert(`"${prod.name}" added to cart.`, 'gold');
    this.closeProductModal();
  }

  updateCartCountUI() {
    const totalQty = this.state.cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cart-count').innerText = totalQty;
  }

  async syncCartBackend() {
    if (!this.state.user) return; // Only sync with API if logged in
    
    try {
      // Loop all items in current cart and send to DB API `/cart/add` or custom batch
      for (const item of this.state.cart) {
        await this.apiFetch('/cart/add', {
          method: 'POST',
          body: JSON.stringify({ 
            productId: item.productId, 
            qty: item.qty,
            size: item.size,
            color: item.color
          })
        });
      }
    } catch (err) {
      console.error('Error syncing cart with backend:', err);
    }
  }

  async renderCart() {
    const container = document.getElementById('cart-content-container');
    
    // If user is logged in, pull cart state from DB
    if (this.state.user) {
      try {
        const res = await this.apiFetch('/cart');
        if (res && res.status === 200) {
          const items = await res.json();
          // Map DB items to state representation
          this.state.cart = items.map(item => ({
            productId: item.productId._id,
            name: item.productId.name,
            qty: item.qty,
            price: item.productId.isOnSale && item.productId.discountPrice ? item.productId.discountPrice : item.productId.price,
            image: item.productId.images[0] || '',
            size: item.size || null,
            color: item.color || null
          }));
          localStorage.setItem('aura_cart', JSON.stringify(this.state.cart));
          this.updateCartCountUI();
        }
      } catch (err) {
        console.error('Failed to load cart from API, using local storage.');
      }
    }

    if (this.state.cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 5rem 0; color: var(--stone);">
          <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">Your cart is currently empty.</p>
          <button class="btn btn-primary" onclick="app.showView('browse')">Browse Collection</button>
        </div>
      `;
      return;
    }

    let itemsHTML = '';
    let subtotal = 0;

    this.state.cart.forEach(item => {
      const lineTotal = item.price * item.qty;
      subtotal += lineTotal;
      itemsHTML += `
        <tr>
          <td>
            <div class="cart-item-title">
              <img src="${item.image}" alt="${item.name}" class="cart-item-thumb">
              <div>
                <h4 style="font-family: var(--font-body); font-size: 1rem; font-weight: 500;">${item.name}</h4>
                ${item.size || item.color ? `
                  <p style="font-size: 0.8rem; color: var(--gold); margin-top: 0.15rem;">
                    ${item.size ? `Size: ${item.size}` : ''} 
                    ${item.size && item.color ? ' | ' : ''} 
                    ${item.color ? `Color: ${item.color}` : ''}
                  </p>
                ` : ''}
                <p style="color: var(--stone); font-size: 0.8rem; margin-top: 0.25rem;">PKR ${item.price.toLocaleString()}</p>
              </div>
            </div>
          </td>
          <td>
            <div class="qty-control">
              <button class="qty-btn" onclick="app.updateCartQty('${item.productId}', -1, '${item.size || ''}', '${item.color || ''}')">-</button>
              <input type="text" class="qty-input" value="${item.qty}" readonly>
              <button class="qty-btn" onclick="app.updateCartQty('${item.productId}', 1, '${item.size || ''}', '${item.color || ''}')">+</button>
            </div>
          </td>
          <td style="color: var(--gold); font-weight: 600;">PKR ${lineTotal.toLocaleString()}</td>
          <td>
            <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;" onclick="app.removeCartItem('${item.productId}', '${item.size || ''}', '${item.color || ''}')">&times;</button>
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="cart-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Total</th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="cart-totals">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>PKR ${subtotal.toLocaleString()}</span>
        </div>
        <div class="totals-row">
          <span>Delivery</span>
          <span style="color: var(--success); font-weight: 500;">FREE</span>
        </div>
        <div class="totals-row grand-total">
          <span>Total</span>
          <span>PKR ${subtotal.toLocaleString()}</span>
        </div>
        <button class="btn btn-primary" style="width: 100%; margin-top: 1.5rem;" onclick="app.showView('checkout')">Proceed to Checkout</button>
      </div>
    `;
  }

  async updateCartQty(productId, amount, sizeVal = '', colorVal = '') {
    const size = sizeVal || null;
    const color = colorVal || null;
    const item = this.state.cart.find(i => i.productId === productId && i.size === size && i.color === color);
    if (!item) return;

    const newQty = item.qty + amount;
    if (newQty <= 0) {
      this.removeCartItem(productId, sizeVal, colorVal);
      return;
    }

    item.qty = newQty;
    localStorage.setItem('aura_cart', JSON.stringify(this.state.cart));
    this.updateCartCountUI();

    if (this.state.user) {
      try {
        await this.apiFetch('/cart/update', {
          method: 'PATCH',
          body: JSON.stringify({ productId, qty: newQty, size, color })
        });
      } catch (err) {
        console.error('Error updating cart on server:', err);
      }
    }
    this.renderCart();
  }

  async removeCartItem(productId, sizeVal = '', colorVal = '') {
    const size = sizeVal || null;
    const color = colorVal || null;
    this.state.cart = this.state.cart.filter(item => !(item.productId === productId && item.size === size && item.color === color));
    localStorage.setItem('aura_cart', JSON.stringify(this.state.cart));
    this.updateCartCountUI();

    if (this.state.user) {
      try {
        await this.apiFetch('/cart/remove', {
          method: 'DELETE',
          body: JSON.stringify({ productId, size, color })
        });
      } catch (err) {
        console.error('Error removing cart item on server:', err);
      }
    }
    this.renderCart();
  }

  // --- CHECKOUT FLOW ---
  loadCheckoutForm() {
    if (!this.state.user) return;
    
    // Prefill user details from state
    document.getElementById('checkout-street').value = this.state.user.address?.street || '';
    document.getElementById('checkout-area').value = this.state.user.address?.area || '';
    document.getElementById('checkout-city').value = this.state.user.address?.city || '';
  }

  async fetchAdminSettingsPublic() {
    try {
      const res = await fetch(`${API_URL}/admin/settings/bank`);
      if (res.status === 200) {
        this.state.adminSettings = await res.json();
        this.updateWhatsAppFAB();
      }
    } catch (err) {
      console.error('Error retrieving bank details:', err);
    }
  }

  updateWhatsAppFAB() {
    const link = document.getElementById('whatsapp-contact-link');
    const navLink = document.getElementById('whatsapp-contact-link-mobile');
    if (!link && !navLink) return;

    const num = this.state.adminSettings?.whatsappNumber;
    const currentHash = window.location.hash.replace('#', '') || 'browse';
    if (num && num.trim() !== '' && currentHash !== 'admin') {
      const cleanNum = num.replace(/\D/g, '');
      const href = `https://wa.me/${cleanNum}`;
      if (link) {
        link.href = href;
        link.style.display = 'flex';
      }
      if (navLink) {
        navLink.href = href;
        navLink.closest('.nav-item').style.display = 'block';
      }
    } else {
      if (link) {
        link.style.display = 'none';
        link.href = '#';
      }
      if (navLink) {
        navLink.href = '#';
        navLink.closest('.nav-item').style.display = 'none';
      }
    }
  }

  toggleBankDetails(show) {
    const block = document.getElementById('checkout-bank-details');
    block.style.display = show ? 'block' : 'none';

    if (show) {
      const list = document.getElementById('checkout-bank-accounts-list');
      const accounts = this.state.adminSettings.bankAccounts || [];
      
      if (accounts.length === 0) {
        list.innerHTML = `<p style="font-style: italic;">No bank accounts configured by admin. Please contact support.</p>`;
        return;
      }

      list.innerHTML = accounts.map(acc => `
        <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(245,242,237,0.05);">
          <strong>${acc.bankName}</strong><br>
          Account Title: ${acc.accountTitle}<br>
          Account Number: ${acc.accountNumber}<br>
          IBAN: ${acc.iban || 'N/A'}
        </div>
      `).join('');
    }
  }

  async handlePlaceOrder(e) {
    e.preventDefault();
    if (this.state.cart.length === 0) {
      this.showAlert('Your cart is empty.', 'rose-gold');
      return;
    }

    const street = document.getElementById('checkout-street').value;
    const area = document.getElementById('checkout-area').value;
    const city = document.getElementById('checkout-city').value;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    const items = this.state.cart.map(item => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      price: item.price,
      size: item.size,
      color: item.color
    }));

    const total = this.state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const payload = {
      items,
      total,
      address: { street, area, city },
      paymentMethod
    };

    try {
      const res = await this.apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.status === 201) {
        this.showAlert('Order placed successfully!', 'success');
        
        // Clear local cart
        this.state.cart = [];
        localStorage.removeItem('aura_cart');
        this.updateCartCountUI();

        // Navigate to tracking page for this order
        document.getElementById('tracking-search-id').value = data.order._id;
        this.showView('tracking');
        this.searchOrder();
      } else {
        this.showAlert(data.message || 'Checkout failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Checkout submission failed.', 'rose-gold');
    }
  }

  // --- ORDER TRACKING ---
  async searchOrder() {
    const orderId = document.getElementById('tracking-search-id').value.trim();
    if (!orderId) {
      this.showAlert('Please enter an Order ID.', 'rose-gold');
      return;
    }

    const panel = document.getElementById('order-tracking-result');
    panel.style.display = 'block';
    panel.innerHTML = `<div style="text-align:center; padding: 2rem; color:var(--stone);">Locating order details...</div>`;

    try {
      const res = await fetch(`${API_URL}/orders/${orderId}`);
      if (res.status !== 200) {
        panel.innerHTML = `<div style="text-align:center; color: var(--rose-gold); padding: 2rem;">Order not found. Check the ID and try again.</div>`;
        return;
      }

      const order = await res.json();
      this.renderOrderTracking(order);
    } catch (err) {
      panel.innerHTML = `<div style="text-align:center; color: var(--rose-gold); padding: 2rem;">Error retrieving tracking details.</div>`;
    }
  }

  renderOrderTracking(order) {
    const panel = document.getElementById('order-tracking-result');
    
    // Status definitions
    const statusMap = {
      pending: { title: 'Pending Confirmation', class: 'status-pending' },
      confirmed: { title: 'Confirmed & Processing', class: 'status-confirmed' },
      shipped: { title: 'Shipped (In Transit)', class: 'status-shipped' },
      delivered: { title: 'Delivered', class: 'status-delivered' },
      cancelled: { title: 'Cancelled', class: 'status-cancelled' }
    };

    const statusInfo = statusMap[order.orderStatus] || statusMap.pending;

    // Items list HTML
    const itemsHTML = order.items.map(item => {
      const optionDetails = (item.size || item.color)
        ? `<div style="font-size:0.75rem; color:var(--gold); margin-top:0.15rem;">
             ${item.size ? `Size: ${item.size}` : ''}
             ${item.size && item.color ? ' | ' : ''}
             ${item.color ? `Color: ${item.color}` : ''}
           </div>`
        : '';
      const reviewButton = order.orderStatus === 'delivered'
        ? `<button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.7rem; margin-top: 0.35rem; display: inline-block;" onclick="app.openWriteReviewModal('${item.productId}', '${item.name.replace(/'/g, "\\'")}')">★ Write Review</button>`
        : '';
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; font-size:0.9rem; padding: 0.5rem 0; border-bottom:1px solid rgba(245,242,237,0.03);">
          <div>
            <span>${item.name} (x${item.qty})</span>
            ${optionDetails}
            ${reviewButton}
          </div>
          <span style="color:var(--gold);">PKR ${(item.price * item.qty).toLocaleString()}</span>
        </div>
      `;
    }).join('');

    // Bank receipt module
    let receiptHTML = '';
    if (order.paymentMethod === 'bank_transfer') {
      if (order.receiptImage) {
        receiptHTML = `
          <div style="margin-top: 1.5rem; background:#121212; padding:1.25rem;">
            <p style="font-size:0.8rem; color:var(--stone); margin-bottom: 0.5rem;">Bank Transfer Receipt Uploaded:</p>
            <a href="${order.receiptImage}" target="_blank">
              <img src="${order.receiptImage}" style="max-width: 150px; border:1px solid var(--gold); cursor:pointer;" alt="Receipt">
            </a>
            <p style="font-size:0.75rem; color:var(--success); margin-top:0.5rem;">Receipt uploaded. Awaiting review.</p>
          </div>
        `;
      } else {
        receiptHTML = `
          <div style="margin-top: 1.5rem; background:#121212; padding:1.25rem; border:1px dashed var(--gold);">
            <p style="font-size:0.85rem; font-weight:500; color:var(--gold); margin-bottom: 0.5rem;">Bank Transfer Payment Verification Required</p>
            <p style="font-size:0.75rem; color:var(--stone); margin-bottom:1rem;">Please upload a screenshot/image of your transaction receipt to confirm your bank transfer payment.</p>
            <form onsubmit="app.handleReceiptUpload(event, '${order._id}')">
              <input type="file" id="receipt-file-input" class="form-input" style="padding: 0.5rem; font-size:0.8rem;" required accept="image/*">
              <button type="submit" class="btn btn-rose" style="padding:0.5rem 1rem; font-size:0.75rem; width:100%; margin-top:0.75rem;">Upload Receipt Screenshot</button>
            </form>
          </div>
        `;
      }
    }

    panel.innerHTML = `
      <div class="tracking-card">
        <div class="tracking-header">
          <div>
            <span style="font-size: 0.75rem; color:var(--stone); text-transform:uppercase; letter-spacing:1px;">Order Reference ID</span>
            <h3 style="font-family:var(--font-body); font-size: 1.1rem; font-weight:600;">${order._id}</h3>
            <span style="font-size:0.8rem; color:var(--stone); display:block; margin-top:0.25rem;">Placed on: ${new Date(order.createdAt).toLocaleDateString()}</span>
          </div>
          <div>
            <span class="status-tag ${statusInfo.class}">${statusInfo.title}</span>
          </div>
        </div>

        <div class="tracking-grid">
          <div>
            <h4 style="font-family:var(--font-body); font-size:0.9rem; text-transform:uppercase; color:var(--gold); margin-bottom: 1rem; border-bottom:1px solid rgba(201,162,39,0.1); padding-bottom:4px;">Items Summary</h4>
            ${itemsHTML}
            <div style="display:flex; justify-content:space-between; font-weight:700; font-size: 1.1rem; color:var(--gold); margin-top: 1rem; padding-top: 0.5rem;">
              <span>Grand Total:</span>
              <span>PKR ${order.total.toLocaleString()}</span>
            </div>
            ${receiptHTML}
          </div>

          <div class="tracking-col-right">
            <h4 style="font-family:var(--font-body); font-size:0.9rem; text-transform:uppercase; color:var(--gold); margin-bottom: 1rem; border-bottom:1px solid rgba(201,162,39,0.1); padding-bottom:4px;">Delivery Address</h4>
            <p style="font-size:0.9rem; color:var(--ivory);">${order.address.street}</p>
            <p style="font-size:0.9rem; color:var(--stone);">${order.address.area}</p>
            <p style="font-size:0.9rem; color:var(--stone);">${order.address.city}</p>

            <h4 style="font-family:var(--font-body); font-size:0.9rem; text-transform:uppercase; color:var(--gold); margin-top: 2rem; margin-bottom: 1rem; border-bottom:1px solid rgba(201,162,39,0.1); padding-bottom:4px;">Payment Summary</h4>
            <p style="font-size:0.9rem;">Method: <span style="font-weight:600; text-transform:uppercase;">${order.paymentMethod.replace('_', ' ')}</span></p>
            <p style="font-size:0.9rem; margin-top:0.25rem;">Status: <span style="font-weight:600; text-transform:uppercase; color:${order.paymentStatus === 'received' ? 'var(--success)' : 'var(--stone)'};">${order.paymentStatus}</span></p>
          </div>
        </div>
      </div>
    `;
  }

  async handleReceiptUpload(e, orderId) {
    e.preventDefault();
    const fileInput = document.getElementById('receipt-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result;
      try {
        const panel = document.getElementById('order-tracking-result');
        panel.innerHTML += `<div style="text-align:center; padding:1rem; color:var(--gold);">Uploading receipt screenshot... Please wait.</div>`;

        // Custom API endpoint for receipt upload (JSON payload)
        const res = await this.apiFetch(`/orders/${orderId}/receipt`, {
          method: 'POST',
          body: JSON.stringify({ receiptImage: base64Data })
        });
        const data = await res.json();

        if (res.status === 200) {
          this.showAlert('Receipt screenshot uploaded successfully!', 'success');
          this.renderOrderTracking(data.order);
        } else {
          this.showAlert(data.message || 'Upload failed', 'rose-gold');
          this.searchOrder(); // refresh view
        }
      } catch (err) {
        this.showAlert('Receipt upload error.', 'rose-gold');
        this.searchOrder();
      }
    };
    reader.readAsDataURL(file);
  }

  // --- PROFILE VIEW ---
  async loadProfileData() {
    if (!this.state.user) return;

    // Populate read-only text container
    const displayContainer = document.getElementById('profile-details-display');
    if (displayContainer) {
      const u = this.state.user;
      const street = u.address?.street || '';
      const area = u.address?.area || '';
      const city = u.address?.city || '';
      const fullAddress = (street || area || city) 
        ? `${street}${street && area ? ', ' : ''}${area}${(street || area) && city ? ', ' : ''}${city}`
        : '<span style="color: var(--stone); font-style: italic;">No shipping address set</span>';

      displayContainer.innerHTML = `
        <p style="margin-bottom: 0.5rem;"><strong>Name:</strong> ${u.firstName} ${u.lastName}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Email:</strong> ${u.email}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Phone:</strong> ${u.phone || '<span style="color: var(--stone); font-style: italic;">Not set</span>'}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Default Address:</strong> ${fullAddress}</p>
      `;
    }

    // Set form fields inside the edit modal
    document.getElementById('profile-first-name').value = this.state.user.firstName || '';
    document.getElementById('profile-last-name').value = this.state.user.lastName || '';
    document.getElementById('profile-phone').value = this.state.user.phone || '';
    document.getElementById('profile-street').value = this.state.user.address?.street || '';
    document.getElementById('profile-area').value = this.state.user.address?.area || '';
    document.getElementById('profile-city').value = this.state.user.address?.city || '';

    // Fetch order history
    try {
      const res = await this.apiFetch('/orders/my');
      if (res.status === 200) {
        const orders = await res.json();
        this.renderProfileOrders(orders);
      }
    } catch (err) {
      console.error('Error fetching my orders:', err);
    }
  }

  openEditProfileModal() {
    // Make sure fields are populated before opening
    document.getElementById('profile-first-name').value = this.state.user.firstName || '';
    document.getElementById('profile-last-name').value = this.state.user.lastName || '';
    document.getElementById('profile-phone').value = this.state.user.phone || '';
    document.getElementById('profile-street').value = this.state.user.address?.street || '';
    document.getElementById('profile-area').value = this.state.user.address?.area || '';
    document.getElementById('profile-city').value = this.state.user.address?.city || '';

    document.getElementById('edit-profile-modal').classList.add('active');
  }

  closeEditProfileModal() {
    document.getElementById('edit-profile-modal').classList.remove('active');
  }

  renderProfileOrders(orders) {
    const list = document.getElementById('profile-order-history-list');
    if (orders.length === 0) {
      list.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--stone);">You have not placed any orders yet.</td></tr>`;
      return;
    }

    list.innerHTML = orders.map(ord => {
      const isDelivered = ord.orderStatus === 'delivered';
      const actionButtons = isDelivered
        ? `<button class="btn btn-stone" style="padding: 0.3rem 0.6rem; font-size:0.75rem;" onclick="app.viewOrderDetails('${ord._id}')">Track</button>
           <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size:0.75rem; margin-left:0.25rem;" onclick="app.viewOrderDetails('${ord._id}')">Review</button>`
        : `<button class="btn btn-stone" style="padding: 0.3rem 0.6rem; font-size:0.75rem;" onclick="app.viewOrderDetails('${ord._id}')">Track</button>`;

      return `
        <tr>
          <td data-label="Order ID" style="font-family: monospace;">${ord._id}</td>
          <td data-label="Date">${new Date(ord.createdAt).toLocaleDateString()}</td>
          <td data-label="Total" style="color:var(--gold); font-weight:600;">PKR ${ord.total.toLocaleString()}</td>
          <td data-label="Payment" style="text-transform:uppercase;">${ord.paymentMethod} (${ord.paymentStatus})</td>
          <td data-label="Status"><span class="status-tag status-${ord.orderStatus}">${ord.orderStatus}</span></td>
          <td data-label="Action">
            <div style="display: flex; gap: 0.35rem; justify-content: flex-end; width: 100%;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  viewOrderDetails(orderId) {
    document.getElementById('tracking-search-id').value = orderId;
    this.showView('tracking');
    this.searchOrder();
  }

  async handleUpdateProfile(e) {
    e.preventDefault();
    const firstName = document.getElementById('profile-first-name').value;
    const lastName = document.getElementById('profile-last-name').value;
    const phone = document.getElementById('profile-phone').value;
    const street = document.getElementById('profile-street').value;
    const area = document.getElementById('profile-area').value;
    const city = document.getElementById('profile-city').value;

    const payload = {
      firstName,
      lastName,
      phone,
      address: { street, area, city }
    };

    try {
      const res = await this.apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.status === 200) {
        this.showAlert('Profile updated successfully!', 'success');
        // Update user state
        this.state.user = data.user;
        localStorage.setItem('aura_user', JSON.stringify(this.state.user));
        this.closeEditProfileModal();
        this.loadProfileData(); // Refresh read-only UI
      } else {
        this.showAlert(data.message || 'Profile update failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Update profile error.', 'rose-gold');
    }
  }

  // --- ADMIN INTERFACE ---
  switchAdminTab(tabName) {
    this.state.currentAdminTab = tabName;
    
    // Toggle active sidebar item
    const items = document.querySelectorAll('.admin-nav-item');
    items.forEach(it => {
      it.classList.toggle('active', it.getAttribute('data-tab') === tabName);
    });

    // Toggle tab panels
    const tabs = document.querySelectorAll('.admin-tab-content');
    tabs.forEach(t => t.style.display = 'none');

    document.getElementById(`admin-tab-${tabName}`).style.display = 'block';

    // Hook to load specific tab data
    if (tabName === 'overview') this.loadAdminOverview();
    if (tabName === 'orders') this.loadAdminOrders();
    if (tabName === 'products') this.loadAdminProducts();
    if (tabName === 'categories') this.loadAdminCategories();
    if (tabName === 'settings') this.loadAdminSettings();
    if (tabName === 'offers') this.loadAdminOffers();
    if (tabName === 'feedback') this.loadAdminFeedback();
  }

  loadAdminDashboard() {
    this.switchAdminTab(this.state.currentAdminTab);
  }

  async loadAdminOverview() {
    try {
      const res = await this.apiFetch('/admin/orders/overview');
      if (res.status === 200) {
        const stats = await res.json();
        document.getElementById('admin-card-total-orders').innerText = stats.totalOrders || 0;
        document.getElementById('admin-card-pending-payment').innerText = stats.pendingPayment || 0;
        document.getElementById('admin-card-received-payment').innerText = stats.paymentReceived || 0;
        document.getElementById('admin-card-delivered-orders').innerText = stats.delivered || 0;
      }

      // Load recent orders
      const ordersRes = await this.apiFetch('/admin/orders?limit=5');
      if (ordersRes.status === 200) {
        const recentOrders = await ordersRes.json();
        const list = document.getElementById('admin-recent-orders-list');
        if (recentOrders.length === 0) {
          list.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--stone);">No orders to display.</td></tr>`;
          return;
        }

        list.innerHTML = recentOrders.map(ord => `
          <tr>
            <td data-label="Order ID" style="font-family: monospace;">${ord._id}</td>
            <td data-label="Customer">${ord.customerId?.firstName || 'Guest'} ${ord.customerId?.lastName || ''}</td>
            <td data-label="Total" style="color:var(--gold); font-weight:600;">PKR ${ord.total.toLocaleString()}</td>
            <td data-label="Payment" style="text-transform:uppercase;">${ord.paymentMethod} (${ord.paymentStatus})</td>
            <td data-label="Status"><span class="status-tag status-${ord.orderStatus}">${ord.orderStatus}</span></td>
            <td data-label="Action">
              <button class="btn btn-stone" style="padding: 0.25rem 0.5rem; font-size:0.7rem;" onclick="app.switchAdminTab('orders')">Manage</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Error fetching admin dashboard numbers:', err);
    }
  }

  async loadAdminOrders() {
    const filterStatus = document.getElementById('admin-orders-filter-status').value;
    try {
      const res = await this.apiFetch(`/admin/orders?status=${filterStatus}`);
      if (res.status === 200) {
        const orders = await res.json();
        this.state.adminOrders = orders;
        const list = document.getElementById('admin-full-orders-list');
        
        if (orders.length === 0) {
          list.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--stone); padding: 2rem;">No orders match criteria.</td></tr>`;
          return;
        }

        list.innerHTML = orders.map(ord => {
          const itemsList = ord.items.map(item => {
            const itemOptions = (item.size || item.color)
              ? ` <span style="color:var(--gold); font-size:0.75rem;">(${item.size ? `S: ${item.size}` : ''}${item.size && item.color ? ', ' : ''}${item.color ? `C: ${item.color}` : ''})</span>`
              : '';
            return `<div>${item.name} x${item.qty}${itemOptions}</div>`;
          }).join('');
          const receiptViewer = ord.receiptImage ? `
            <div style="margin-top:0.5rem;">
              <a href="${ord.receiptImage}" target="_blank" style="color:var(--gold); font-size:0.8rem; text-decoration:underline;">[View receipt Screenshot]</a>
            </div>
          ` : '<span style="color:var(--stone); font-size:0.8rem;">No receipt uploaded</span>';

          const markReceivedBtn = ord.paymentMethod === 'bank_transfer' && ord.paymentStatus === 'pending' ? `
            <button class="btn btn-rose" style="padding:0.2rem 0.4rem; font-size:0.65rem; margin-bottom:0.2rem;" onclick="app.updateOrderPayment('${ord._id}', 'received')">Confirm Transfer</button>
          ` : '';

          return `
            <tr>
              <td data-label="Order Details">
                <strong style="font-family:monospace; font-size:0.75rem;">ID: ${ord._id}</strong><br>
                <span style="color:var(--stone); font-size:0.7rem;">Customer: ${ord.customerId?.firstName || 'Guest'} (${ord.customerId?.phone || ''})</span>
                <div style="margin-top:0.35rem; padding-left:0.4rem; border-left:1px solid var(--stone); font-size:0.7rem; color:var(--stone);">
                  ${itemsList}
                </div>
              </td>
              <td data-label="Delivery Address" style="font-size:0.7rem; color:var(--stone);">
                ${ord.address.street}, ${ord.address.area}<br>
                <strong>${ord.address.city}</strong>
              </td>
              <td data-label="Payment Info">
                <span style="text-transform:uppercase; font-size:0.7rem; font-weight:600;">${ord.paymentMethod.replace('_', ' ')}</span><br>
                <span style="color:${ord.paymentStatus === 'received' ? 'var(--success)' : 'var(--rose-gold)'}; font-size:0.7rem; font-weight:500;">
                  Status: ${ord.paymentStatus.toUpperCase()}
                </span>
                ${receiptViewer}
              </td>
              <td data-label="Order Status">
                <span class="status-tag status-${ord.orderStatus}" style="font-size:0.65rem; padding:0.15rem 0.35rem;">${ord.orderStatus}</span>
              </td>
              <td data-label="Actions">
                <div style="display:flex; flex-direction:column; gap:0.2rem;">
                  ${markReceivedBtn}
                  <select class="form-input" style="padding:0.2rem; font-size:0.65rem;" onchange="app.updateOrderStatus('${ord._id}', this.value)">
                    <option value="">Update Status...</option>
                    <option value="pending" ${ord.orderStatus === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="confirmed" ${ord.orderStatus === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="shipped" ${ord.orderStatus === 'shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="delivered" ${ord.orderStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="cancelled" ${ord.orderStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  </select>
                  <button class="btn btn-primary" style="padding:0.2rem; font-size:0.65rem;" onclick="app.downloadOrderPDF('${ord._id}')">Download PDF</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  }

  async updateOrderStatus(orderId, newStatus) {
    if (!newStatus) return;
    try {
      const res = await this.apiFetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderStatus: newStatus })
      });
      if (res.status === 200) {
        this.showAlert('Order status updated successfully!', 'success');
        this.loadAdminOrders();
      }
    } catch (err) {
      this.showAlert('Failed to update status.', 'rose-gold');
    }
  }

  async updateOrderPayment(orderId, newPaymentStatus) {
    try {
      const res = await this.apiFetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus: newPaymentStatus })
      });
      if (res.status === 200) {
        this.showAlert('Payment status updated to RECEIVED.', 'success');
        this.loadAdminOrders();
      }
    } catch (err) {
      this.showAlert('Failed to update payment status.', 'rose-gold');
    }
  }

  downloadOrderPDF(orderId) {
    const ord = this.state.adminOrders.find(o => o._id === orderId);
    if (!ord) {
      this.showAlert('Order details not found.', 'rose-gold');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      this.showAlert('Popup blocked! Please allow popups to download PDF.', 'rose-gold');
      return;
    }

    const itemsRows = ord.items.map(item => {
      const options = [];
      if (item.size) options.push(item.size);
      if (item.color) options.push(item.color);
      const optionsStr = options.length > 0 ? options.join(', ') : '-';
      const productLink = window.location.origin + '/?viewProduct=' + item.productId;
      
      return '<tr>' +
        '<td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px;">' +
          '<a href="' + productLink + '" target="_blank" style="color: #000; text-decoration: underline; font-weight: bold;">' + item.name + '</a>' +
        '</td>' +
        '<td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; text-align: center;">' + optionsStr + '</td>' +
        '<td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; text-align: center;">' + item.qty + '</td>' +
        '<td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; text-align: right;">' + item.price.toLocaleString() + '</td>' +
        '<td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; text-align: right;">' + (item.price * item.qty).toLocaleString() + '</td>' +
        '</tr>';
    }).join('');

    const formattedDate = new Date(ord.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const isCod = ord.paymentMethod === 'cod';
    const logoUrl = window.location.origin + '/Logo.png';
    const firstProductId = ord.items[0]?.productId || '';
    const productUrl = encodeURIComponent(window.location.origin + '/?viewProduct=' + firstProductId);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${ord._id}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace, Arial, sans-serif;
            color: #000;
            margin: 0;
            padding: 0;
            width: 297mm;
            height: 210mm;
            display: flex;
            box-sizing: border-box;
            background-color: #fff;
          }
          .invoice-container {
            width: 148.5mm;
            height: 210mm;
            padding: 10mm 8mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border-right: 1px dashed #000;
            position: relative;
            overflow: hidden;
          }
          .invoice-header {
            border-bottom: 1.5px solid #000;
            padding-bottom: 5px;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .logo-area {
            display: flex;
            align-items: center;
            gap: 5px;
          }
          .logo-img {
            height: 32px;
            width: auto;
            object-fit: contain;
          }
          .brand-title {
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            font-family: Arial, sans-serif;
          }
          .doc-title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-family: Arial, sans-serif;
          }
          .header-meta {
            margin-top: 5px;
            font-size: 10px;
            line-height: 1.3;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            margin-top: 5px;
          }
          .invoice-body {
            display: flex;
            gap: 15px;
            margin-top: 8px;
            flex-grow: 1;
            min-height: 0;
          }
          .customer-details {
            width: 46%;
            font-size: 10px;
            line-height: 1.4;
          }
          .order-summary {
            width: 54%;
            display: flex;
            flex-direction: column;
          }
          .section-heading {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            margin-bottom: 6px;
            padding-bottom: 2px;
            font-family: Arial, sans-serif;
          }
          .shipping-bold {
            font-weight: bold;
            font-size: 10.5px;
          }
          .products-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
          }
          .products-table th {
            border-bottom: 1.5px solid #000;
            padding: 3px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            text-transform: uppercase;
          }
          .totals-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 11px;
          }
          .totals-table td {
            padding: 3px;
          }
          .grand-total-row {
            font-weight: bold;
            font-size: 13px;
            border-top: 1.5px solid #000;
            border-bottom: 1.5px solid #000;
          }
          .payment-status-block {
            margin-top: 5px;
            font-size: 10px;
            text-transform: uppercase;
          }
          .cod-badge {
            border: 2px solid #000;
            padding: 5px;
            text-align: center;
            font-weight: 900;
            font-size: 14px;
            font-family: Arial, sans-serif;
            margin-top: 6px;
            background-color: #000;
            color: #fff;
          }
          .paid-badge {
            border: 1.5px solid #000;
            padding: 5px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            font-family: Arial, sans-serif;
            margin-top: 6px;
            color: #000;
          }
          .invoice-footer {
            border-top: 1.5px solid #000;
            margin-top: 8px;
            padding-top: 5px;
            font-size: 9px;
            line-height: 1.3;
          }
          .courier-notes {
            margin-top: 4px;
            background-color: #f9f9f9;
            padding: 4px;
            border: 1px solid #ddd;
          }
          .courier-notes ul {
            margin: 2px 0 0 0;
            padding-left: 12px;
          }
          .qr-container {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          }
          .qr-img {
            width: 50px;
            height: 50px;
            object-fit: contain;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div class="header-top">
              <div class="logo-area">
                <img src="${logoUrl}" alt="logo" class="logo-img" onerror="this.style.display='none'">
                <span class="brand-title">Khan's Fashion</span>
              </div>
              <div class="doc-title">Invoice</div>
            </div>
            
            <div class="header-meta">
              <div><strong>Website:</strong> khansfashion.shop</div>
              <div><strong>Email:</strong> khans.fashion121@gmail.com</div>
              <div><strong>Phone:</strong> +92 3357567147</div>
            </div>

            <div class="meta-row">
              <div>
                <strong>Track ID:</strong> ${ord._id}<br>
                <strong>Date:</strong> ${formattedDate}
              </div>
              <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${productUrl}" alt="QR" class="qr-img">
              </div>
            </div>
          </div>

          <div class="invoice-body">
            <!-- Left Side (Customer Details) -->
            <div class="customer-details">
              <div class="section-heading">Customer Details</div>
              <div><strong>Name:</strong> ${ord.customerId?.firstName || 'Guest'} ${ord.customerId?.lastName || ''}</div>
              <div><strong>Phone:</strong> <span style="font-size: 11px; font-weight: bold; border-bottom: 1px solid #000;">${ord.customerId?.phone || 'N/A'}</span></div>
              <div><strong>Email:</strong> ${ord.customerId?.email || 'N/A'}</div>
              
              <div class="section-heading" style="margin-top: 10px;">Shipping Address</div>
              <div class="shipping-bold">
                Street: ${ord.address.street}<br>
                Area: ${ord.address.area}<br>
                City: ${ord.address.city}<br>
                Province: ${ord.address.state || 'Punjab'}
              </div>
            </div>

            <!-- Right Side (Order Summary) -->
            <div class="order-summary">
              <div class="section-heading">Products Ordered</div>
              <div style="flex-grow: 1; overflow-y: auto; max-height: 120px;">
                <table class="products-table">
                  <thead>
                    <tr>
                      <th style="text-align: left; width: 45%;">Product</th>
                      <th style="text-align: center; width: 15%;">Opt</th>
                      <th style="text-align: center; width: 10%;">Qty</th>
                      <th style="text-align: right; width: 15%;">Price</th>
                      <th style="text-align: right; width: 15%;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsRows}
                  </tbody>
                </table>
              </div>

              <!-- Totals -->
              <table class="totals-table">
                <tr>
                  <td style="text-align: right; color: #555; font-size: 10px;">Subtotal:</td>
                  <td style="text-align: right; font-weight: bold; width: 35%;">PKR ${ord.total.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="text-align: right; color: #555; font-size: 10px;">Delivery:</td>
                  <td style="text-align: right; font-weight: bold; text-transform: uppercase; font-size: 9.5px;">Free Delivery</td>
                </tr>
                <tr class="grand-total-row">
                  <td style="text-align: right; padding-top: 4px;">Grand Total:</td>
                  <td style="text-align: right; padding-top: 4px;">PKR ${ord.total.toLocaleString()}</td>
                </tr>
              </table>

              <div class="payment-status-block">
                <strong>Method:</strong> ${ord.paymentMethod.replace('_', ' ')} | 
                <strong>Status:</strong> ${ord.paymentStatus}
              </div>

              ${
                isCod 
                  ? `<div class="cod-badge">COLLECT COD: PKR ${ord.total.toLocaleString()}</div>`
                  : `<div class="paid-badge">PAID IN FULL</div>`
              }
            </div>
          </div>

          <div class="invoice-footer" style="text-align: center;">
            <div style="margin-bottom: 5px; font-weight: bold;">Thank you for shopping with Khan's Fashion.</div>
            <div style="font-size: 9.5px; border: 1px dashed #000; padding: 4px; display: inline-block; width: 100%; box-sizing: border-box;">
              <strong>Click or Scan to View Product Details:</strong><br>
              <a href="${decodeURIComponent(productUrl)}" target="_blank" style="color: #000; text-decoration: underline; font-weight: bold; font-family: sans-serif;">
                khansfashion.shop/?viewProduct=${firstProductId}
              </a>
            </div>
          </div>
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 1000);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  renderAdminMediaPreviews() {
    const imageContainer = document.getElementById('admin-image-preview-container');
    const videoContainer = document.getElementById('admin-video-preview-container');

    if (imageContainer) {
      imageContainer.innerHTML = this.state.adminImages.map((img, idx) => `
        <div class="admin-preview-thumbnail">
          <img src="${img}" alt="Preview ${idx}">
          <button type="button" class="admin-preview-remove-btn" onclick="app.removeAdminImage(${idx})">&times;</button>
        </div>
      `).join('');
    }

    if (videoContainer) {
      videoContainer.innerHTML = this.state.adminVideos.map((vid, idx) => `
        <div class="admin-preview-thumbnail">
          <video src="${vid}" muted playsinline></video>
          <button type="button" class="admin-preview-remove-btn" onclick="app.removeAdminVideo(${idx})">&times;</button>
        </div>
      `).join('');
    }
  }

  removeAdminImage(idx) {
    this.state.adminImages.splice(idx, 1);
    this.renderAdminMediaPreviews();
  }

  removeAdminVideo(idx) {
    this.state.adminVideos.splice(idx, 1);
    this.renderAdminMediaPreviews();
  }

  // --- PRODUCTS CRUD ---
  async loadAdminProducts() {
    try {
      const res = await this.apiFetch('/products?category=all');
      if (res.status === 200) {
        const prods = await res.json();
        const list = document.getElementById('admin-products-list');
        list.innerHTML = prods.map(p => `
          <tr>
            <td data-label="Product">
              <div class="cart-item-title">
                <img src="${p.images[0] || ''}" class="cart-item-thumb" style="width:40px; height:50px;">
                <strong>${p.name}</strong>
              </div>
            </td>
            <td data-label="Category">${p.category}</td>
            <td data-label="Price" style="color:var(--gold); font-weight:600;">PKR ${p.price.toLocaleString()}</td>
            <td data-label="Status">
              ${p.isOnSale ? `<span class="status-tag status-confirmed">Sale (PKR ${p.discountPrice?.toLocaleString()})</span>` : '<span class="status-tag status-pending">Regular</span>'}
            </td>
            <td data-label="Actions">
              <div style="display:flex; gap:0.5rem; justify-content:flex-end; width:100%;">
                <button class="btn btn-stone" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.showEditProductForm('${p._id}')">Edit</button>
                <button class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.handleDeleteProduct('${p._id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Error retrieving products:', err);
    }
  }

  async showAddProductForm() {
    this.hideProductForm(); // Clear fields
    document.getElementById('admin-product-sizes').value = '';
    document.getElementById('admin-product-colors').value = '';
    document.getElementById('admin-product-form-container').style.display = 'block';
    document.getElementById('admin-product-form-title').innerText = 'Add New Product';
    
    // Clear size prices table
    document.getElementById('admin-product-size-prices-body').innerHTML = '';
    
    // Load categories option dropdown
    const select = document.getElementById('admin-product-category');
    select.innerHTML = '<option value="">-- No Category (Uncategorized) --</option>' + this.state.allCategories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
  }

  addAdminSizePriceRow(size = '', price = '', discountPrice = '') {
    const tbody = document.getElementById('admin-product-size-prices-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'admin-size-price-row';
    tr.innerHTML = `
      <td style="padding: 0.25rem;">
        <input type="text" class="form-input size-input" style="padding: 0.3rem; margin:0;" value="${size}" placeholder="e.g. S, M, L" required>
      </td>
      <td style="padding: 0.25rem;">
        <input type="number" class="form-input price-input" style="padding: 0.3rem; margin:0;" value="${price}" placeholder="e.g. 1500" required>
      </td>
      <td style="padding: 0.25rem;">
        <input type="number" class="form-input discount-input" style="padding: 0.3rem; margin:0;" value="${discountPrice}" placeholder="e.g. 1200">
      </td>
      <td style="padding: 0.25rem; text-align: center;">
        <button type="button" class="btn btn-rose" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin:0;" onclick="this.closest('tr').remove()">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  async showEditProductForm(productId) {
    try {
      const res = await fetch(`${API_URL}/products/${productId}`);
      if (res.status === 200) {
        const prod = await res.json();
        
        document.getElementById('admin-product-form-container').style.display = 'block';
        document.getElementById('admin-product-form-title').innerText = 'Modify Product details';

        document.getElementById('admin-product-id').value = prod._id;
        document.getElementById('admin-product-name').value = prod.name;
        document.getElementById('admin-product-price').value = prod.price;
        document.getElementById('admin-product-discount').value = prod.discountPrice || '';
        document.getElementById('admin-product-onsale').checked = prod.isOnSale || false;
        document.getElementById('admin-product-sizes').value = prod.sizes ? prod.sizes.join(', ') : '';
        document.getElementById('admin-product-colors').value = prod.colors ? prod.colors.join(', ') : '';
        document.getElementById('admin-product-description').value = prod.description;
        
        // Clear and load size prices
        document.getElementById('admin-product-size-prices-body').innerHTML = '';
        if (prod.sizePrices && prod.sizePrices.length > 0) {
          prod.sizePrices.forEach(sp => {
            this.addAdminSizePriceRow(sp.size, sp.price, sp.discountPrice || '');
          });
        }

        // Load media files into state and render previews
        this.state.adminImages = prod.images || [];
        this.state.adminVideos = prod.videos || [];
        this.renderAdminMediaPreviews();

        const select = document.getElementById('admin-product-category');
        select.innerHTML = `<option value="" ${!prod.category || prod.category === 'uncategorized' ? 'selected' : ''}>-- No Category (Uncategorized) --</option>` + 
          this.state.allCategories.map(c => `
            <option value="${c.slug}" ${prod.category === c.slug ? 'selected' : ''}>${c.name}</option>
          `).join('');
      }
    } catch (err) {
      this.showAlert('Could not load product details.', 'rose-gold');
    }
  }

  hideProductForm() {
    document.getElementById('admin-product-form-container').style.display = 'none';
    document.getElementById('admin-product-id').value = '';
    document.getElementById('admin-product-name').value = '';
    document.getElementById('admin-product-price').value = '';
    document.getElementById('admin-product-discount').value = '';
    document.getElementById('admin-product-onsale').checked = false;
    document.getElementById('admin-product-sizes').value = '';
    document.getElementById('admin-product-colors').value = '';
    document.getElementById('admin-product-description').value = '';
    
    // Clear files state and previews
    this.state.adminImages = [];
    this.state.adminVideos = [];
    this.renderAdminMediaPreviews();
    document.getElementById('admin-product-size-prices-body').innerHTML = '';
    
    // Reset file input values
    const imageFilesInput = document.getElementById('admin-product-image-files');
    if (imageFilesInput) imageFilesInput.value = '';
    const videoFilesInput = document.getElementById('admin-product-video-files');
    if (videoFilesInput) videoFilesInput.value = '';
  }

  async handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('admin-product-id').value;
    const name = document.getElementById('admin-product-name').value;
    const category = document.getElementById('admin-product-category').value;
    const price = parseFloat(document.getElementById('admin-product-price').value);
    const discountPriceInput = document.getElementById('admin-product-discount').value;
    const discountPrice = discountPriceInput ? parseFloat(discountPriceInput) : undefined;
    const isOnSale = document.getElementById('admin-product-onsale').checked;
    const description = document.getElementById('admin-product-description').value;
    const sizesInput = document.getElementById('admin-product-sizes').value;
    const colorsInput = document.getElementById('admin-product-colors').value;

    const sizes = sizesInput.split(',').map(s => s.trim()).filter(Boolean);
    const colors = colorsInput.split(',').map(c => c.trim()).filter(Boolean);

    // Collect size-specific prices
    const sizePricesRows = document.querySelectorAll('.admin-size-price-row');
    const sizePrices = [];
    sizePricesRows.forEach(row => {
      const sizeVal = row.querySelector('.size-input').value.trim();
      const priceVal = parseFloat(row.querySelector('.price-input').value);
      const discountVal = row.querySelector('.discount-input').value.trim();
      const discPrice = discountVal ? parseFloat(discountVal) : undefined;
      if (sizeVal && !isNaN(priceVal)) {
        sizePrices.push({ size: sizeVal, price: priceVal, discountPrice: discPrice });
      }
    });

    const payload = {
      name, 
      category, 
      price, 
      discountPrice, 
      isOnSale, 
      sizes,
      colors,
      description, 
      images: this.state.adminImages, 
      videos: this.state.adminVideos,
      sizePrices
    };

    const endpoint = id ? `/admin/products/${id}` : '/admin/products';
    const method = id ? 'PATCH' : 'POST';

    try {
      const saveBtn = e.target.querySelector('button[type="submit"]');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving...';
      }
      this.showAlert('Saving product details & media files...', 'gold');

      const res = await this.apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Product';
      }

      if (res.status === 200 || res.status === 201) {
        this.showAlert(id ? 'Product updated.' : 'Product created.', 'success');
        this.hideProductForm();
        this.loadAdminProducts();
        this.fetchProducts(); // Refresh browse view list too
        this.fetchCategories(); // Update dynamic category filters
      } else {
        this.showAlert(data.message || 'Save failed.', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit product error.', 'rose-gold');
    }
  }

  async handleDeleteProduct(productId) {
    // AGENT.json states we must require confirmation before deleting anything!
    const confirmed = confirm('CRITICAL CONFIRMATION: Are you sure you want to delete this product? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const res = await this.apiFetch(`/admin/products/${productId}`, {
        method: 'DELETE'
      });
      if (res.status === 200) {
        this.showAlert('Product deleted successfully.', 'success');
        this.loadAdminProducts();
        this.fetchProducts(); // refresh public grid
        this.fetchCategories(); // Update dynamic category filters
      } else {
        const data = await res.json();
        this.showAlert(data.message || 'Delete failed', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Error deleting product.', 'rose-gold');
    }
  }

  // --- CATEGORIES MANAGEMENT ---
  async loadAdminCategories() {
    try {
      const res = await fetch(`${API_URL}/categories`);
      if (res.status === 200) {
        this.state.allCategories = await res.json();
        const list = document.getElementById('admin-categories-list');
        list.innerHTML = this.state.allCategories.map(c => `
          <tr>
            <td data-label="Category Name"><strong>${c.name}</strong></td>
            <td data-label="Slug"><code style="background:#121212; padding:0.25rem 0.5rem;">${c.slug}</code></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async handleCategorySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('admin-category-name');
    const name = nameInput.value.trim();

    try {
      const res = await this.apiFetch('/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      const data = await res.json();

      if (res.status === 201) {
        this.showAlert('Category created successfully!', 'success');
        nameInput.value = '';
        this.loadAdminCategories();
        this.fetchCategories(); // update public filters
      } else {
        this.showAlert(data.message || 'Failed to create category', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Error submitting category.', 'rose-gold');
    }
  }

  // --- BANK SETTINGS ---
  loadAdminSettings() {
    const waInput = document.getElementById('admin-whatsapp-number');
    if (waInput) {
      waInput.value = this.state.adminSettings.whatsappNumber || '';
    }

    const container = document.getElementById('admin-bank-accounts-container');
    const accounts = this.state.adminSettings.bankAccounts || [];

    container.innerHTML = '';
    if (accounts.length === 0) {
      this.addBankAccountRow();
      return;
    }

    accounts.forEach((acc, idx) => {
      this.renderBankAccountRow(acc, idx);
    });
  }

  renderBankAccountRow(acc = { bankName: '', accountTitle: '', accountNumber: '', iban: '' }, index) {
    const container = document.getElementById('admin-bank-accounts-container');
    const row = document.createElement('div');
    row.className = 'bank-account-setting-row';
    row.id = `bank-row-${index}`;

    row.innerHTML = `
      <div>
        <label class="form-label">Bank Name</label>
        <input type="text" class="form-input bank-name-input" value="${acc.bankName}" required>
      </div>
      <div>
        <label class="form-label">Account Title</label>
        <input type="text" class="form-input bank-title-input" value="${acc.accountTitle}" required>
      </div>
      <div>
        <label class="form-label">Account Number</label>
        <input type="text" class="form-input bank-number-input" value="${acc.accountNumber}" required>
      </div>
      <div>
        <label class="form-label">IBAN (Optional)</label>
        <input type="text" class="form-input bank-iban-input" value="${acc.iban || ''}">
      </div>
      <div>
        <button type="button" class="btn btn-danger" style="padding: 0.45rem 1rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap;" onclick="app.removeBankAccountRow(${index})">
          <span style="font-size: 1.1rem; line-height: 1;">&times;</span> <span>Delete Account</span>
        </button>
      </div>
    `;

    container.appendChild(row);
  }

  addBankAccountRow() {
    const container = document.getElementById('admin-bank-accounts-container');
    const count = container.children.length;
    this.renderBankAccountRow(undefined, count);
  }

  removeBankAccountRow(index) {
    const row = document.getElementById(`bank-row-${index}`);
    if (row) row.remove();
  }

  async handleBankSettingsSubmit(e) {
    e.preventDefault();
    const container = document.getElementById('admin-bank-accounts-container');
    const rows = container.getElementsByClassName('bank-account-setting-row');
    const bankAccounts = [];

    for (let row of rows) {
      const bankName = row.getElementsByClassName('bank-name-input')[0].value.trim();
      const accountTitle = row.getElementsByClassName('bank-title-input')[0].value.trim();
      const accountNumber = row.getElementsByClassName('bank-number-input')[0].value.trim();
      const iban = row.getElementsByClassName('bank-iban-input')[0].value.trim();

      if (bankName && accountTitle && accountNumber) {
        bankAccounts.push({ bankName, accountTitle, accountNumber, iban });
      }
    }

    try {
      const res = await this.apiFetch('/admin/settings/bank', {
        method: 'PATCH',
        body: JSON.stringify({ bankAccounts })
      });
      const data = await res.json();

      if (res.status === 200) {
        this.showAlert('Bank settings saved successfully!', 'success');
        this.state.adminSettings = data.settings;
      } else {
        this.showAlert(data.message || 'Failed to save bank settings', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit settings error.', 'rose-gold');
    }
  }

  async handleWhatsAppSettingsSubmit(e) {
    e.preventDefault();
    const whatsappNumber = document.getElementById('admin-whatsapp-number').value.trim();

    try {
      const res = await this.apiFetch('/admin/settings/bank', {
        method: 'PATCH',
        body: JSON.stringify({ whatsappNumber })
      });
      const data = await res.json();

      if (res.status === 200) {
        this.showAlert('WhatsApp support number saved successfully!', 'success');
        this.state.adminSettings = data.settings;
        this.updateWhatsAppFAB();
      } else {
        this.showAlert(data.message || 'Failed to save WhatsApp number', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit settings error.', 'rose-gold');
    }
  }

  // --- OFFERS MANAGEMENT ---
  async loadAdminOffers() {
    await this.fetchProducts(); // Ensure we have the latest products list
    this.renderAdminOffers();
  }

  renderAdminOffers() {
    const list = document.getElementById('admin-offers-list');
    if (!list) return;

    if (this.state.products.length === 0) {
      list.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--stone); padding: 2rem 0;">No products found.</td></tr>`;
      return;
    }

    list.innerHTML = this.state.products.map(prod => {
      const isOnSaleChecked = prod.isOnSale ? 'checked' : '';
      return `
        <tr>
          <td data-label="Product">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img src="${prod.images[0] || 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600'}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 0; border: 1px solid rgba(245,242,237,0.1);">
              <span><strong>${prod.name}</strong></span>
            </div>
          </td>
          <td data-label="Regular Price (PKR)">
            <input type="number" id="offer-price-${prod._id}" class="form-input" style="max-width: 140px; padding: 0.4rem;" value="${prod.price}">
          </td>
          <td data-label="Discount Price (PKR)">
            <input type="number" id="offer-discount-${prod._id}" class="form-input" style="max-width: 140px; padding: 0.4rem;" value="${prod.discountPrice || ''}">
          </td>
          <td data-label="On Sale Status" style="text-align: center;">
            <input type="checkbox" id="offer-onsale-${prod._id}" ${isOnSaleChecked} style="width: 18px; height: 18px; cursor: pointer; display: inline-block;">
          </td>
          <td data-label="Actions">
            <button class="btn btn-primary" onclick="app.updateOffer('${prod._id}')" style="padding: 0.4rem 1rem; font-size: 0.8rem;">Save</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async updateOffer(productId) {
    const price = parseFloat(document.getElementById(`offer-price-${productId}`).value);
    const discountInput = document.getElementById(`offer-discount-${productId}`).value;
    const isOnSale = document.getElementById(`offer-onsale-${productId}`).checked;

    if (isNaN(price) || price <= 0) {
      this.showAlert('Please enter a valid regular price.', 'rose-gold');
      return;
    }

    const discountPrice = discountInput ? parseFloat(discountInput) : null;
    if (discountPrice !== null && (isOnSale && (isNaN(discountPrice) || discountPrice <= 0 || discountPrice >= price))) {
      this.showAlert('Discount price must be less than regular price.', 'rose-gold');
      return;
    }

    const payload = {
      price,
      discountPrice,
      isOnSale
    };

    try {
      const res = await this.apiFetch(`/admin/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      if (res.status === 200) {
        this.showAlert('Offer updated successfully!', 'success');
        this.loadAdminOffers();
      } else {
        const data = await res.json();
        this.showAlert(data.message || 'Failed to update offer.', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Update offer error.', 'rose-gold');
    }
  }
  // --- PRODUCT REVIEWS MODAL OVERLAY ---
  openWriteReviewModal(productId, productName) {
    const nameLabel = document.getElementById('write-review-product-name');
    const idInput = document.getElementById('write-review-product-id');
    const ratingSelect = document.getElementById('write-review-rating');
    const commentInput = document.getElementById('write-review-comment');

    if (nameLabel) nameLabel.innerText = productName;
    if (idInput) idInput.value = productId;
    if (ratingSelect) ratingSelect.value = '5';
    if (commentInput) commentInput.value = '';

    const modal = document.getElementById('write-product-review-modal');
    if (modal) modal.classList.add('active');
  }

  closeWriteReviewModal() {
    const modal = document.getElementById('write-product-review-modal');
    if (modal) modal.classList.remove('active');
  }

  async handleOrderHistoryReviewSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('write-review-product-id').value;
    const rating = parseInt(document.getElementById('write-review-rating').value) || 5;
    const comment = document.getElementById('write-review-comment').value.trim();

    if (!productId || !comment) return;

    try {
      const res = await this.apiFetch(`/products/${productId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment })
      });

      if (res.status === 201) {
        this.showAlert('Review submitted successfully!', 'success');
        this.closeWriteReviewModal();
        this.searchOrder(); // Refresh tracking list details
      } else {
        const data = await res.json();
        this.showAlert(data.message || 'Failed to submit review.', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit review error.', 'rose-gold');
    }
  }

  // --- ADMIN PRODUCT REVIEWS MANAGEMENT ---
  async loadAdminFeedback() {
    const list = document.getElementById('admin-reviews-list');
    if (!list) return;

    try {
      const res = await this.apiFetch('/admin/reviews');
      if (res.status === 200) {
        const data = await res.json();

        if (data.length === 0) {
          list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--stone);">No customer product reviews found.</td></tr>`;
          return;
        }

        list.innerHTML = data.map(item => {
          const prodName = item.productId?.name || 'Deleted Product';
          const stars = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
          return `
            <tr>
              <td data-label="Product"><strong>${prodName}</strong></td>
              <td data-label="Customer">
                <strong>${item.customerName}</strong><br>
                <span style="font-size:0.75rem; color:var(--stone);">${new Date(item.createdAt).toLocaleDateString()}</span>
              </td>
              <td data-label="Rating" style="color:var(--gold); font-size:0.85rem; letter-spacing:1px;">${stars}</td>
              <td data-label="Comment">
                <p style="font-size:0.85rem; line-height:1.4; white-space: pre-wrap; margin:0;">${item.comment}</p>
              </td>
              <td data-label="Admin Reply">
                <textarea id="reply-text-${item._id}" class="form-input" rows="2" style="font-size:0.85rem; padding:0.4rem; resize:vertical;" placeholder="Write response...">${item.adminReply || ''}</textarea>
              </td>
              <td data-label="Actions">
                <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.75rem;" onclick="app.saveFeedbackReply('${item._id}')">Save</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Error loading admin reviews:', err);
    }
  }

  async saveFeedbackReply(feedbackId) {
    const adminReply = document.getElementById(`reply-text-${feedbackId}`).value.trim();

    try {
      const res = await this.apiFetch(`/admin/reviews/${feedbackId}/reply`, {
        method: 'PATCH',
        body: JSON.stringify({ adminReply })
      });

      if (res.status === 200) {
        this.showAlert('Reply saved successfully!', 'success');
        this.loadAdminFeedback();
      } else {
        const data = await res.json();
        this.showAlert(data.message || 'Failed to save reply', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit reply error.', 'rose-gold');
    }
  }

  // --- PRODUCT REVIEWS ---
  async loadProductReviews(productId) {
    const formContainer = document.getElementById('product-review-form-container');
    const guestNotice = document.getElementById('product-review-guest-notice');
    const listContainer = document.getElementById('product-reviews-list');

    if (!listContainer) return;

    const headers = {};
    if (this.state.accessToken) {
      headers['Authorization'] = `Bearer ${this.state.accessToken}`;
    }

    try {
      const res = await fetch(`${API_URL}/products/${productId}/reviews`, { headers });
      if (res.status === 200) {
        const { reviews, canReview, purchaseRequired } = await res.json();

        // Handle review form visibility based on auth + verified purchase state
        if (canReview) {
          if (formContainer) formContainer.style.display = 'block';
          if (guestNotice) guestNotice.style.display = 'none';
        } else {
          if (formContainer) formContainer.style.display = 'none';
          if (guestNotice) {
            if (!this.state.user) {
              guestNotice.style.display = 'block';
              guestNotice.innerHTML = `Please <a href="javascript:void(0)" onclick="app.closeProductModal(); app.showView('auth');" style="color: var(--gold); text-decoration: underline;">Sign In</a> to share your feedback for this product.`;
            } else {
              guestNotice.style.display = 'none'; // Hide notices for logged-in users who can't review
            }
          }
        }

        if (reviews.length === 0) {
          listContainer.innerHTML = '';
          return;
        }

        listContainer.innerHTML = reviews.map(item => {
          const stars = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
          const formattedDate = new Date(item.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });

          const replyBlock = item.adminReply
            ? `
              <div style="margin-top: 1rem; margin-left: 1.5rem; padding: 0.75rem 1rem; background-color: rgba(201, 162, 39, 0.05); border-left: 2px solid var(--gold);">
                <strong style="color: var(--gold); font-size: 0.8rem; display: block; margin-bottom: 0.25rem;">Reply from Khan's Fashion Support:</strong>
                <p style="font-size: 0.85rem; color: var(--ivory); line-height: 1.4; margin: 0;">${item.adminReply}</p>
                <span style="font-size: 0.7rem; color: var(--stone); display: block; margin-top: 0.25rem;">Replied on: ${new Date(item.repliedAt).toLocaleDateString()}</span>
              </div>
            `
            : '';

          return `
            <div style="background-color: var(--charcoal); padding: 1.25rem; border: 1px solid rgba(245,242,237,0.03);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong style="color: var(--gold); font-size: 0.95rem;">${item.customerName}</strong>
                <span style="font-size: 0.8rem; color: var(--stone);">${formattedDate}</span>
              </div>
              <div style="color: var(--gold); margin-bottom: 0.5rem; font-size: 0.9rem; letter-spacing: 1px;">${stars}</div>
              <p style="font-size: 0.9rem; color: var(--ivory); line-height: 1.4; margin: 0; white-space: pre-wrap;">${item.comment}</p>
              ${replyBlock}
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Error loading product reviews:', err);
    }
  }

  async handleReviewSubmit(e, productId) {
    e.preventDefault();
    const ratingSelect = document.getElementById('review-rating-input');
    const commentInput = document.getElementById('review-comment-input');

    if (!ratingSelect || !commentInput) return;

    const rating = parseInt(ratingSelect.value) || 5;
    const comment = commentInput.value.trim();

    if (!comment) return;

    try {
      const res = await this.apiFetch(`/products/${productId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment })
      });

      if (res.status === 201) {
        this.showAlert('Review submitted successfully!', 'success');
        commentInput.value = '';
        this.loadProductReviews(productId);
      } else {
        const data = await res.json();
        this.showAlert(data.message || 'Failed to submit review.', 'rose-gold');
      }
    } catch (err) {
      this.showAlert('Submit review error.', 'rose-gold');
    }
  }
}

// Instantiate and expose globally
const app = new AuraApp();
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
