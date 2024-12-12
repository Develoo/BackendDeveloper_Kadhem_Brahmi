// Import required modules
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Initialize the Express app
const app = express();
const port = 3000;

// DummyJSON API base URL
const DUMMY_JSON_API_URL = 'https://dummyjson.com/products';

// Create a cache instance with a TTL of 5 minutes (300 seconds)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

// Create a rate limiter for client requests (200 requests per minute per client)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // Limit each IP to 200 requests per windowMs
  message: 'Too many requests from this IP, please try again after a minute',
});

// Apply rate limiting middleware globally
app.use(limiter);

// Middleware to parse incoming JSON request bodies
app.use(express.json());

// Validate incoming query parameters for search
const validateSearchQuery = (query) => {
  const schema = Joi.object({
    query: Joi.string().min(3).required(),  // Query must be at least 3 characters long
  });
  return schema.validate(query);
};

// Validate incoming category parameter
const validateCategory = (category) => {
  const schema = Joi.object({
    category: Joi.string().min(3).required(),  // Category must be a string of at least 3 characters
  });
  return schema.validate(category);
};

// Validate the returned product data from DummyJSON API
const validateProductData = (productData) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    price: Joi.number().required(),
    category: Joi.string().required(),
    description: Joi.string().required(),
  });
  return schema.validate(productData);
};

// Fetch all products from DummyJSON API
const fetchAllProducts = async () => {
  // Check if the data is in the cache
  const cachedData = cache.get('allProducts');
  if (cachedData) {
    console.log('Serving from cache: all products');
    return cachedData;  // Return cached data if available
  }

  try {
    const response = await axios.get(DUMMY_JSON_API_URL);
    
    // Validate the structure of the returned product data
    const { error } = Joi.array().items(validateProductData).validate(response.data.products);
    if (error) {
      console.error('Invalid product data from DummyJSON:', error.details);
      throw new Error('Invalid product data');
    }

    cache.set('allProducts', response.data.products);  // Cache the data
    return response.data.products;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
};

// Fetch a single product by ID from DummyJSON API
const fetchProductById = async (id) => {
  try {
    const response = await axios.get(`${DUMMY_JSON_API_URL}/${id}`);
    
    // Validate the returned product data
    const { error } = validateProductData(response.data);
    if (error) {
      console.error(`Invalid product data for ID ${id}:`, error.details);
      throw new Error('Invalid product data');
    }

    return response.data;
  } catch (error) {
    console.error(`Error fetching product with ID ${id}:`, error);
    return null;
  }
};

// Search products by name
const searchProductsByName = async (searchQuery) => {
  const cacheKey = `search_${searchQuery.toLowerCase()}`;
  
  // Check if search result is cached
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Serving from cache: search results for "${searchQuery}"`);
    return cachedData;  // Return cached search results if available
  }

  try {
    const products = await fetchAllProducts();  // Fetch all products and filter
    const searchResults = products.filter((product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    cache.set(cacheKey, searchResults);  // Cache the search results
    return searchResults;
  } catch (error) {
    console.error('Error searching for products:', error);
    return [];
  }
};

// Filter products by category
const filterProductsByCategory = async (category) => {
  const cacheKey = `category_${category.toLowerCase()}`;

  // Check if category result is cached
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Serving from cache: products in category "${category}"`);
    return cachedData;  // Return cached category results if available
  }

  try {
    const products = await fetchAllProducts();  // Fetch all products and filter
    const categoryResults = products.filter((product) => 
      product.category.toLowerCase() === category.toLowerCase()
    );
    cache.set(cacheKey, categoryResults);  // Cache the category filter result
    return categoryResults;
  } catch (error) {
    console.error('Error filtering products by category:', error);
    return [];
  }
};

// Define routes

// Endpoint to retrieve all products
app.get('/products', async (req, res) => {
  const products = await fetchAllProducts();
  res.json(products);
});

// Endpoint to retrieve a product by ID
app.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  const product = await fetchProductById(id);

  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
});

// Endpoint to search products by name
app.get('/products/search', (req, res) => {
  const { query } = req.query;

  // Validate query
  const { error } = validateSearchQuery(req.query);
  if (error) {
    return res.status(400).json({ message: 'Invalid search query', details: error.details });
  }

  searchProductsByName(query).then((products) => res.json(products));
});

// Endpoint to filter products by category
app.get('/products/category/:category', (req, res) => {
  const { category } = req.params;

  // Validate category
  const { error } = validateCategory(req.params);
  if (error) {
    return res.status(400).json({ message: 'Invalid category', details: error.details });
  }

  filterProductsByCategory(category).then((products) => {
    if (products.length > 0) {
      res.json(products);
    } else {
      res.status(404).json({ message: 'No products found for this category' });
    }
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
