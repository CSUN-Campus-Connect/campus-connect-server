# Campus Connect API Documentation

## Overview

The Campus Connect API provides endpoints for managing marketplace listings, user authentication, events, and social features for the CSUN campus community.

**Base URL:** `http://localhost:8000/api/v1`

**Authentication:** JWT Bearer tokens required for protected endpoints

---

## Marketplace API

### GET /api/v1/marketplace

Retrieves a list of marketplace listings with optional filtering.

#### Authentication
- **Required:** No (public endpoint)

#### Request Parameters

##### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `category` | string | No | Filter by marketplace category | `textbooks`, `electronics`, `furniture`, `clothing`, `school_supplies`, `tickets`, `services`, `other` |
| `minPrice` | number | No | Minimum price filter (inclusive) | `10.00` |
| `maxPrice` | number | No | Maximum price filter (inclusive) | `100.00` |
| `search` | string | No | Search term for title/description | `calculus textbook` |
| `condition` | string | No | Filter by item condition | `new`, `likeNew`, `excellent`, `good`, `fair`, `poor` |

##### Example Request
```bash
GET /api/v1/marketplace?category=textbooks&minPrice=20&maxPrice=100&search=calculus
```

#### Response

##### Success Response (200 OK)

**Response Body:**
```json
{
  "listings": [
    {
      "id": "clx1a2b3c4d5e6f7g8h9i0",
      "title": "Calculus: Early Transcendentals 9th Edition",
      "description": "Barely used calculus textbook. Only highlighted a few pages. Perfect for MATH 150A/B.",
      "price": 75.00,
      "originalPrice": 250.00,
      "images": [
        "https://example.com/images/calculus-front.jpg",
        "https://example.com/images/calculus-back.jpg"
      ],
      "condition": "likeNew",
      "category": "textbooks",
      "status": "active",
      "sellerId": "user123",
      "seller": {
        "id": "user123",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe.123@my.csun.edu",
        "profilePicture": "https://example.com/avatars/john.jpg"
      },
      "createdAt": "2026-02-15T10:30:00.000Z",
      "updatedAt": "2026-02-15T10:30:00.000Z",
      "_count": {
        "favoritedBy": 5
      }
    },
    {
      "id": "clx2b3c4d5e6f7g8h9i0j1",
      "title": "TI-84 Plus CE Graphing Calculator",
      "description": "Used for one semester. Works perfectly. Comes with charging cable and manual.",
      "price": 45.00,
      "originalPrice": 120.00,
      "images": [
        "https://example.com/images/calculator.jpg"
      ],
      "condition": "excellent",
      "category": "electronics",
      "status": "active",
      "sellerId": "user456",
      "seller": {
        "id": "user456",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith.456@my.csun.edu",
        "profilePicture": "https://example.com/avatars/jane.jpg"
      },
      "createdAt": "2026-02-20T14:15:00.000Z",
      "updatedAt": "2026-02-20T14:15:00.000Z",
      "_count": {
        "favoritedBy": 2
      }
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

##### Error Responses

**400 Bad Request** - Invalid query parameters
```json
{
  "error": "Invalid category. Must be one of: textbooks, electronics, furniture, clothing, school_supplies, tickets, services, other"
}
```

**500 Internal Server Error** - Server error
```json
{
  "error": "An error occurred while fetching listings"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `listings` | array | Array of marketplace listing objects |
| `listings[].id` | string | Unique listing identifier (CUID) |
| `listings[].title` | string | Listing title (max 200 chars) |
| `listings[].description` | string | Detailed item description |
| `listings[].price` | number | Current asking price in USD |
| `listings[].originalPrice` | number\|null | Original retail price (optional) |
| `listings[].images` | string[] | Array of image URLs |
| `listings[].condition` | string | Item condition: `new`, `likeNew`, `excellent`, `good`, `fair`, `poor` |
| `listings[].category` | string | Item category |
| `listings[].status` | string | Listing status: `active`, `sold`, `deleted` |
| `listings[].sellerId` | string | User ID of the seller |
| `listings[].seller` | object | Seller user object |
| `listings[].seller.id` | string | Seller's user ID |
| `listings[].seller.firstName` | string | Seller's first name |
| `listings[].seller.lastName` | string | Seller's last name |
| `listings[].seller.email` | string | Seller's email address |
| `listings[].seller.profilePicture` | string\|null | URL to seller's profile picture |
| `listings[].createdAt` | string | ISO 8601 timestamp of listing creation |
| `listings[].updatedAt` | string | ISO 8601 timestamp of last update |
| `listings[]._count.favoritedBy` | number | Number of users who favorited this listing |
| `total` | number | Total number of listings matching filters |
| `page` | number | Current page number (for pagination) |
| `limit` | number | Number of results per page |

#### Example Usage

##### cURL Example
```bash
curl -X GET 'http://localhost:8000/api/v1/marketplace?category=textbooks&minPrice=20&maxPrice=100' \
  -H 'Content-Type: application/json'
```

##### JavaScript (Axios) Example
```javascript
import axios from 'axios';

async function getMarketplaceListings() {
  try {
    const response = await axios.get('http://localhost:8000/api/v1/marketplace', {
      params: {
        category: 'textbooks',
        minPrice: 20,
        maxPrice: 100,
        search: 'calculus'
      }
    });
    
    console.log('Listings:', response.data.listings);
    console.log('Total results:', response.data.total);
  } catch (error) {
    console.error('Error fetching listings:', error.response?.data || error.message);
  }
}
```

##### Python (Requests) Example
```python
import requests

def get_marketplace_listings():
    url = 'http://localhost:8000/api/v1/marketplace'
    params = {
        'category': 'textbooks',
        'minPrice': 20,
        'maxPrice': 100,
        'search': 'calculus'
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        print(f"Found {data['total']} listings")
        for listing in data['listings']:
            print(f"- {listing['title']}: ${listing['price']}")
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
```

#### Notes

- All prices are in USD
- Images are returned as full URLs and can be displayed directly
- The `_count.favoritedBy` field shows listing popularity
- Listings with `status: 'deleted'` are excluded from results
- Search is case-insensitive and matches against title and description
- Multiple filters can be combined (e.g., category + price range + search)
- Results are ordered by creation date (newest first)

#### Business Logic

1. **Filtering Priority:**
   - Status filter (always excludes deleted items)
   - Category filter (exact match)
   - Price range filter (inclusive bounds)
   - Condition filter (exact match)
   - Search filter (fuzzy match on title/description)

2. **Performance:**
   - Database indexes on: `sellerId`, `category`, `status`, `price`, `createdAt`
   - Typical response time: 50-200ms
   - Results limited to 100 listings per request

3. **Security:**
   - No authentication required (public listings)
   - Seller email addresses are included in response
   - Seller personal information is limited to name and profile picture

---

## Additional Endpoints

### POST /api/v1/marketplace
Create a new marketplace listing (authentication required).

### GET /api/v1/marketplace/:id
Get details for a specific listing.

### PUT /api/v1/marketplace/:id
Update a marketplace listing (authentication required, seller only).

### DELETE /api/v1/marketplace/:id
Delete a marketplace listing (authentication required, seller only).

### POST /api/v1/marketplace/:id/favorite
Add or remove a listing from favorites (authentication required).

### GET /api/v1/marketplace/favorites
Get all favorited listings for the authenticated user.

### POST /api/v1/marketplace/:id/contact
Contact the seller of a listing (authentication required).

---

## Authentication

Protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

To obtain a token, authenticate via:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`

---

## Rate Limiting

- Public endpoints: 100 requests per 15 minutes per IP
- Authenticated endpoints: 1000 requests per 15 minutes per user

---

## Error Handling

All API errors follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Changelog

### v1.0.0 (2026-02-01)
- Initial marketplace API release
- Support for 8 item categories
- Favorites functionality
- Image upload support

---

*For questions or issues, contact the Campus Connect development team or create an issue on GitHub.*
