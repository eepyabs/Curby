"""
Real-time Semantic Segmentation with Webcam
Runs trained DeepLabV3 model on live webcam feed
Optimized for RTX 4070 Ti Super
Now with GPS positioning and Firebase integration with intelligent upload throttling
"""

import torch
import cv2
import numpy as np
from torchvision import transforms
from collections import deque
import time
import argparse
from datetime import datetime, timedelta
import json
import hashlib
import os

# GPS and location imports
try:
    import geocoder  # pip install geocoder
    GPS_AVAILABLE = True
except ImportError:
    GPS_AVAILABLE = False
    print("Warning: geocoder not installed. Install with: pip install geocoder")

# Firebase imports
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("Warning: firebase-admin not installed. Install with: pip install firebase-admin")

# Mapillary Vistas color palette for visualization
MAPILLARY_COLORS = np.array([
    [165, 42, 42],    # construction--barrier--curb
    [0, 192, 0],      # construction--barrier--fence
    [196, 196, 196],  # construction--barrier--guard-rail
    [190, 153, 153],  # construction--barrier--other-barrier
    [180, 165, 180],  # construction--barrier--wall
    [90, 120, 150],   # construction--flat--bike-lane
    [102, 102, 156],  # construction--flat--crosswalk-plain
    [128, 64, 255],   # construction--flat--curb-cut
    [140, 140, 200],  # construction--flat--parking
    [170, 170, 170],  # construction--flat--pedestrian-area
    [250, 170, 160],  # construction--flat--rail-track
    [96, 96, 96],     # construction--flat--road
    [230, 150, 140],  # construction--flat--service-lane
    [128, 64, 128],   # construction--flat--sidewalk
    [110, 110, 110],  # construction--structure--bridge
    [244, 35, 232],   # construction--structure--building
    [150, 100, 100],  # construction--structure--tunnel
    [70, 70, 70],     # human--person
    [150, 150, 150],  # human--rider--bicyclist
    [220, 20, 60],    # human--rider--motorcyclist
    [255, 0, 0],      # human--rider--other-rider
    [255, 0, 100],    # marking--crosswalk-zebra
    [255, 0, 200],    # marking--general
    [200, 128, 128],  # nature--mountain
    [255, 255, 255],  # nature--sand
    [64, 170, 64],    # nature--sky
    [230, 160, 50],   # nature--snow
    [70, 130, 180],   # nature--terrain
    [190, 255, 255],  # nature--vegetation
    [152, 251, 152],  # nature--water
    [107, 142, 35],   # object--banner
    [0, 170, 30],     # object--bench
    [255, 255, 128],  # object--bike-rack
    [250, 0, 30],     # object--billboard
    [100, 140, 180],  # object--catch-basin
    [220, 220, 220],  # object--cctv-camera
    [220, 128, 128],  # object--fire-hydrant
    [222, 40, 40],    # object--junction-box
    [100, 170, 30],   # object--mailbox
    [40, 40, 40],     # object--manhole
    [33, 33, 33],     # object--phone-booth
    [100, 128, 160],  # object--pothole
    [142, 0, 0],      # object--street-light
    [70, 100, 150],   # object--support--pole
    [210, 170, 100],  # object--support--traffic-sign-frame
    [153, 153, 153],  # object--support--utility-pole
    [128, 128, 128],  # object--traffic-light
    [0, 0, 80],       # object--traffic-sign--back
    [250, 170, 30],   # object--traffic-sign--front
    [192, 192, 192],  # object--trash-can
    [220, 220, 0],    # object--vehicle--bicycle
    [140, 140, 20],   # object--vehicle--boat
    [119, 11, 32],    # object--vehicle--bus
    [150, 0, 255],    # object--vehicle--car
    [0, 60, 100],     # object--vehicle--caravan
    [0, 0, 142],      # object--vehicle--motorcycle
    [0, 0, 90],       # object--vehicle--on-rails
    [0, 0, 230],      # object--vehicle--other-vehicle
    [0, 80, 100],     # object--vehicle--trailer
    [128, 64, 64],    # object--vehicle--truck
    [0, 0, 110],      # object--vehicle--wheeled-slow
    [0, 0, 70],       # void--car-mount
    [0, 0, 142],      # void--ego-vehicle
    [0, 0, 0],        # void--unlabeled
], dtype=np.uint8)


class LocationTracker:
    """Track device location using multiple methods"""
    
    def __init__(self):
        self.last_location = None
        self.last_update_time = None
        self.location_cache_duration = 30  # Cache location for 30 seconds
        
    def get_location(self):
        """Get current device location with caching"""
        # Return cached location if recent enough
        if (self.last_location is not None and 
            self.last_update_time is not None and
            (datetime.now() - self.last_update_time).seconds < self.location_cache_duration):
            return self.last_location
        
        if not GPS_AVAILABLE:
            print("GPS not available - using fallback IP-based location")
            return self._get_ip_location()
        
        # Try to get GPS location (works on mobile devices with GPS)
        try:
            g = geocoder.ip('me')  # Can also try geocoder.osm() for GPS
            if g.ok:
                location = {
                    'latitude': g.latlng[0],
                    'longitude': g.latlng[1],
                    'address': g.address,
                    'city': g.city,
                    'country': g.country,
                    'accuracy': 'ip',  # or 'gps' if using actual GPS
                    'timestamp': datetime.now().isoformat()
                }
                self.last_location = location
                self.last_update_time = datetime.now()
                return location
        except Exception as e:
            print(f"Error getting location: {e}")
        
        return None
    
    def _get_ip_location(self):
        """Fallback to IP-based location"""
        try:
            import requests
            response = requests.get('https://ipapi.co/json/', timeout=5)
            if response.status_code == 200:
                data = response.json()
                return {
                    'latitude': data.get('latitude'),
                    'longitude': data.get('longitude'),
                    'address': f"{data.get('city')}, {data.get('region')}",
                    'city': data.get('city'),
                    'country': data.get('country_name'),
                    'accuracy': 'ip',
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            print(f"IP location failed: {e}")
        return None


class FirebaseUploader:
    """Handle detection uploads with intelligent throttling to prevent spam.

    Supports two upload modes:
      1. API mode (preferred): POSTs individual detections to the .NET API
         so the iOS app can read them from the same /api/hazards/Detection endpoint.
      2. Legacy Firebase mode: writes batched docs directly to Firestore.
    """

    def __init__(self, firebase_config_path=None, upload_interval=60,
                 min_distance_meters=10, batch_size=5,
                 api_base_url=None, source_device_id="camera_segmentation"):
        """
        Initialize uploader with throttling

        Args:
            firebase_config_path: Path to Firebase credentials JSON (legacy mode)
            upload_interval: Minimum seconds between uploads (default: 60)
            min_distance_meters: Minimum distance moved to trigger upload (default: 10m)
            batch_size: Number of detections to batch before upload (default: 5)
            api_base_url: Base URL for .NET API, e.g. "http://localhost:5049" (preferred mode)
            source_device_id: Device identifier sent with each detection
        """
        self.firebase_initialized = False
        self.db = None
        self.bucket = None

        # API mode (preferred)
        self.api_base_url = api_base_url.rstrip('/') if api_base_url else None
        self.source_device_id = source_device_id

        # Throttling parameters - PREVENTS SPAM
        self.upload_interval = upload_interval
        self.min_distance_meters = min_distance_meters
        self.batch_size = batch_size

        # Upload tracking
        self.last_upload_time = None
        self.last_upload_location = None
        self.detection_batch = []
        self.upload_queue = []

        # Statistics
        self.total_detections = 0
        self.total_uploads = 0
        self.uploads_prevented_by_time = 0
        self.uploads_prevented_by_distance = 0

        # Prefer API mode; fall back to legacy Firebase
        if self.api_base_url:
            print(f"✓ Upload mode: API ({self.api_base_url})")
        elif FIREBASE_AVAILABLE and firebase_config_path:
            self.initialize_firebase(firebase_config_path)

    def initialize_firebase(self, config_path):
        """Initialize Firebase connection"""
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(config_path)
                firebase_admin.initialize_app(cred, {
                    'storageBucket': 'your-project-id.appspot.com'  # Update this!
                })

            self.db = firestore.client()
            self.bucket = storage.bucket()
            self.firebase_initialized = True
            print("✓ Firebase initialized successfully")
        except Exception as e:
            print(f"Firebase initialization failed: {e}")
            self.firebase_initialized = False

    def calculate_distance(self, loc1, loc2):
        """Calculate distance between two GPS coordinates in meters using Haversine formula"""
        if not loc1 or not loc2:
            return float('inf')

        from math import radians, sin, cos, sqrt, atan2

        # Haversine formula
        R = 6371000  # Earth radius in meters

        lat1, lon1 = radians(loc1['latitude']), radians(loc1['longitude'])
        lat2, lon2 = radians(loc2['latitude']), radians(loc2['longitude'])

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))

        distance = R * c
        return distance

    def should_upload(self, location):
        """
        Determine if we should upload based on throttling rules
        This is the ANTI-SPAM logic!
        """
        current_time = datetime.now()

        # RULE 1: Time-based throttling (prevent spam by time)
        if self.last_upload_time:
            time_since_last = (current_time - self.last_upload_time).seconds
            if time_since_last < self.upload_interval:
                self.uploads_prevented_by_time += 1
                return False, f"Too soon (waited {time_since_last}s/{self.upload_interval}s)"

        # RULE 2: Distance-based throttling (prevent spam by location)
        if self.last_upload_location and location:
            distance = self.calculate_distance(self.last_upload_location, location)
            if distance < self.min_distance_meters:
                self.uploads_prevented_by_distance += 1
                return False, f"Too close (moved {distance:.1f}m/{self.min_distance_meters}m)"

        # RULE 3: Batch size requirement (prevent spam by batching)
        if len(self.detection_batch) < self.batch_size:
            return False, f"Batching ({len(self.detection_batch)}/{self.batch_size} detections)"

        return True, "Upload permitted"

    def add_detection(self, detection_data, location):
        """Add detection to batch"""
        self.total_detections += 1

        detection_record = {
            'timestamp': datetime.now().isoformat(),
            'location': location,
            'detections': detection_data,
            'detection_id': hashlib.md5(
                f"{location['latitude']}{location['longitude']}{datetime.now()}".encode()
            ).hexdigest()[:12]
        }

        self.detection_batch.append(detection_record)

        # Check if we should upload (anti-spam check)
        should_upload, reason = self.should_upload(location)

        if should_upload:
            self.upload_batch()

        return should_upload, reason

    def upload_batch(self):
        """Upload batched detections via the .NET API (api/hazards/Detection)"""
        if not self.api_base_url:
            print("API base URL not configured - skipping upload")
            self.detection_batch.clear()
            return False

        if not self.detection_batch:
            return False

        try:
            import requests
        except ImportError:
            print("requests library not installed - skipping upload")
            self.detection_batch.clear()
            return False

        uploaded_count = 0
        try:
            for record in self.detection_batch:
                location = record.get('location', {})
                lat = location.get('latitude', 0)
                lon = location.get('longitude', 0)

                # Each record has a list of class detections from that frame
                detections = record.get('detections', [])
                for det in detections:
                    payload = {
                        'type': det.get('class_name', 'unknown'),
                        'roadSegmentId': self._make_road_segment_id(lat, lon),
                        'sourceDeviceId': self.source_device_id,
                        'severity': self._estimate_severity(det),
                        'latitude': lat,
                        'longitude': lon,
                        'confidence': det.get('confidence', 0.0)
                    }

                    resp = requests.post(
                        f"{self.api_base_url}/api/hazards/Detection",
                        json=payload,
                        timeout=10
                    )
                    if resp.status_code < 300:
                        uploaded_count += 1
                    else:
                        print(f"  API error {resp.status_code}: {resp.text[:120]}")

            print(f"\n✓ Uploaded {uploaded_count} detections via API")

            # Update tracking to prevent spam
            self.last_upload_time = datetime.now()
            if self.detection_batch:
                self.last_upload_location = self.detection_batch[-1]['location']

            self.total_uploads += 1
            self.detection_batch.clear()
            return True

        except Exception as e:
            print(f"Upload failed: {e}")
            return False

    @staticmethod
    def _make_road_segment_id(lat, lon):
        """Generate a stable road-segment key from GPS coords (rounded to ~100 m grid)"""
        return f"seg_{lat:.3f}_{lon:.3f}"

    @staticmethod
    def _estimate_severity(detection):
        """Map detection confidence / percentage to a 1-5 severity score"""
        pct = detection.get('percentage', 0)
        if pct > 10:
            return 5
        elif pct > 5:
            return 4
        elif pct > 2:
            return 3
        elif pct > 1:
            return 2
        return 1

    def get_statistics(self):
        """Get upload statistics"""
        return {
            'total_detections': self.total_detections,
            'total_uploads': self.total_uploads,
            'uploads_prevented_time': self.uploads_prevented_by_time,
            'uploads_prevented_distance': self.uploads_prevented_by_distance,
            'current_batch_size': len(self.detection_batch),
            'upload_efficiency': f"{(self.total_uploads / max(1, self.total_detections)) * 100:.1f}%"
        }


class WebcamSegmentation:
    def __init__(self, model_path, device='cuda', fps_smoothing=30,
                 enable_gps=False, enable_firebase=False, firebase_config=None,
                 upload_interval=60, min_distance=10, detection_sample_rate=5,
                 api_base_url=None, source_device_id="camera_segmentation"):
        """
        Initialize webcam segmentation with optional GPS and Firebase

        Args:
            model_path: Path to trained model checkpoint
            device: 'cuda' or 'cpu'
            fps_smoothing: Number of frames to average for FPS calculation
            enable_gps: Enable GPS tracking
            enable_firebase: Enable Firebase uploads
            firebase_config: Path to Firebase credentials JSON
            upload_interval: Minimum seconds between uploads
            min_distance: Minimum distance in meters to trigger upload
            detection_sample_rate: Capture detections every N frames (default: 5)
            api_base_url: Base URL for .NET API (e.g. "http://localhost:5049")
            source_device_id: Device identifier sent with detections
                                  Lower = more data, Higher = less redundant data
        """
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")

        # Load model
        print(f"Loading model from {model_path}...")
        self.model, self.num_classes = self.load_model(model_path)
        self.model.eval()

        # Generate color palette for the number of classes
        self.colors = self.generate_color_palette(self.num_classes)
        print(f"Generated color palette for {self.num_classes} classes")

        # Load or generate class names
        self.class_names = self.load_class_names()

        # Position tracking
        self.last_det = []
        self.pos = [0.0, 0.0]
        self.last_pos = [0.0, 0.0]

        # Detection sampling
        self.detection_sample_rate = detection_sample_rate

        # Classes to ignore (static/background elements that don't change)
        self.ignored_classes = {
            'Road', 'Sky', 'Building', 'Vegetation', 'Terrain',
            'Mountain', 'Sand', 'Snow', 'Water', 'Wall',
            'Bridge', 'Tunnel', 'Overpass', 'Underpass',
            'Parking', 'Parking Space', 'Driveway',
            'Forest', 'Park', 'Nature Reserve',
            'Residential Zone', 'Commercial Zone', 'Industrial Zone', 'Agricultural Zone',
            'Bike Lane', 'Service Lane', 'Pedestrian Area',
            'Highway', 'Freeway', 'Expressway'
        }

        # GPS and Firebase
        self.enable_gps = enable_gps and GPS_AVAILABLE
        # Enable upload if API URL is set OR if Firebase SDK is available
        self.enable_firebase = enable_firebase and (api_base_url or FIREBASE_AVAILABLE)

        if self.enable_gps:
            self.location_tracker = LocationTracker()
            self.current_location = None
            print("✓ GPS tracking enabled")

        if self.enable_firebase:
            self.firebase_uploader = FirebaseUploader(
                firebase_config_path=firebase_config,
                upload_interval=upload_interval,
                min_distance_meters=min_distance,
                batch_size=5,
                api_base_url=api_base_url,
                source_device_id=source_device_id
            )
            print(f"✓ Detection uploads enabled (interval: {upload_interval}s, min distance: {min_distance}m)")

        # Image preprocessing
        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

        # FPS tracking
        self.fps_queue = deque(maxlen=fps_smoothing)
        self.frame_times = deque(maxlen=fps_smoothing)

        # Settings
        self.show_overlay = True
        self.overlay_alpha = 0.6
        self.show_original = False
        self.confidence_threshold = 0.5
        self.show_labels = True
        self.show_gps_info = True

    def load_class_names(self):
        """Load Mapillary Vistas class names"""
        class_names = [
            "Bird", "Ground Animal", "Curb", "Fence", "Guard Rail", "Barrier", "Wall",
            "Bike Lane", "Crosswalk - Plain", "Curb Cut", "Parking", "Pedestrian Area",
            "Rail Track", "Road", "Service Lane", "Sidewalk", "Bridge", "Building",
            "Tunnel", "Person", "Bicyclist", "Motorcyclist", "Other Rider",
            "Lane Marking - Crosswalk", "Lane Marking - General", "Mountain", "Sand",
            "Sky", "Snow", "Terrain", "Vegetation", "Water", "Banner", "Bench",
            "Bike Rack", "Billboard", "Catch Basin", "CCTV Camera", "Fire Hydrant",
            "Junction Box", "Mailbox", "Manhole", "Phone Booth", "Pothole", "Street Light",
            "Pole", "Traffic Sign Frame", "Utility Pole", "Traffic Light",
            "Traffic Sign (Back)", "Traffic Sign (Front)", "Trash Can", "Bicycle", "Boat",
            "Bus", "Car", "Caravan", "Motorcycle", "On Rails", "Other Vehicle", "Trailer",
            "Truck", "Wheeled Slow", "Car Mount", "Ego Vehicle", "Unlabeled",
            "Parking Meter", "Street Light", "Traffic Cone", "Construction", "Oil Stain",
            "Manhole Cover", "Sewer", "Road Divider", "Crosswalk Lines", "Stop Line",
            "Arrow Marking", "Turn Lane", "Speed Bump", "Pedestrian Crossing",
            "Bike Symbol", "Text Marking", "Symbol", "Hatched Marking", "Road Edge",
            "Parking Space", "Driveway", "Speed Hump", "Pedestrian Island", "Traffic Island",
            "Median", "Overpass", "Underpass", "Highway", "Freeway", "Expressway",
            "Toll Booth", "Gas Station", "Parking Structure", "Loading Zone", "Bus Stop",
            "Taxi Stand", "Emergency Vehicle", "School Zone", "Playground Zone",
            "Residential Zone", "Commercial Zone", "Industrial Zone", "Agricultural Zone",
            "Forest", "Park", "Nature Reserve", "Wildlife Crossing", "Bike Path",
            "Footpath", "Shared Path", "Stairs", "Ramp", "Escalator", "Elevator",
            "Door", "Window", "Roof", "Chimney", "Solar Panel", "Antenna",
            "Satellite Dish", "Flag", "Awning", "Canopy", "Umbrella"
        ]

        while len(class_names) < self.num_classes:
            class_names.append(f"Class {len(class_names)}")

        return class_names[:self.num_classes]

    def generate_color_palette(self, num_classes):
        """Generate distinct colors for each class"""
        np.random.seed(42)
        colors = np.zeros((num_classes, 3), dtype=np.uint8)

        for i in range(num_classes):
            hue = (i * 360 / num_classes) % 360
            saturation = 0.7 + (i % 3) * 0.1
            value = 0.8 + (i % 2) * 0.2

            h_i = int(hue / 60) % 6
            f = (hue / 60) - h_i
            p = value * (1 - saturation)
            q = value * (1 - f * saturation)
            t = value * (1 - (1 - f) * saturation)

            if h_i == 0:
                r, g, b = value, t, p
            elif h_i == 1:
                r, g, b = q, value, p
            elif h_i == 2:
                r, g, b = p, value, t
            elif h_i == 3:
                r, g, b = p, q, value
            elif h_i == 4:
                r, g, b = t, p, value
            else:
                r, g, b = value, p, q

            colors[i] = [int(r * 255), int(g * 255), int(b * 255)]

        colors[0] = [0, 0, 0]
        return colors

    def load_model(self, model_path):
        """Load trained model"""
        checkpoint = torch.load(model_path, map_location=self.device, weights_only=False)

        if 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        else:
            state_dict = checkpoint

        num_classes = state_dict['classifier.4.weight'].shape[0]
        print(f"Detected {num_classes} classes in model")

        from torchvision.models.segmentation import deeplabv3_resnet50
        model = deeplabv3_resnet50(weights=None, num_classes=num_classes, aux_loss=True)
        model.load_state_dict(state_dict)
        model.to(self.device)

        return model, num_classes

    def preprocess_frame(self, frame):
        """Preprocess webcam frame for model input"""
        frame_resized = cv2.resize(frame, (1024, 512))
        frame_rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
        input_tensor = self.transform(frame_rgb)
        input_batch = input_tensor.unsqueeze(0).to(self.device)
        return input_batch, frame_resized

    def postprocess_output(self, output, original_shape):
        """Convert model output to colored segmentation mask"""
        logits = output['out'].squeeze(0)
        probs = torch.softmax(logits, dim=0)
        confidences, pred = torch.max(probs, dim=0)
        pred = pred.cpu().numpy()
        confidences = confidences.cpu().numpy()

        mask = confidences >= self.confidence_threshold
        pred_filtered = pred.copy()
        pred_filtered[~mask] = 0

        pred_resized = cv2.resize(
            pred_filtered.astype(np.uint8),
            (original_shape[1], original_shape[0]),
            interpolation=cv2.INTER_NEAREST
        )

        confidences_resized = cv2.resize(
            confidences.astype(np.float32),
            (original_shape[1], original_shape[0]),
            interpolation=cv2.INTER_NEAREST
        )

        colored_mask = self.colors[pred_resized]
        return colored_mask, pred_resized, confidences_resized

    def create_overlay(self, frame, mask):
        """Create semi-transparent overlay"""
        return cv2.addWeighted(frame, 1 - self.overlay_alpha, mask, self.overlay_alpha, 0)

    def extract_detection_data(self, pred, confidences):
        """Extract detection summary for Firebase upload (filtering out static/background classes)"""
        h, w = pred.shape
        unique_classes, counts = np.unique(pred, return_counts=True)
        total_pixels = h * w

        detections = []
        for class_id, count in zip(unique_classes, counts):
            if class_id == 0:  # Skip background
                continue

            class_name = self.class_names[class_id]

            # Skip ignored classes (static background elements)
            if class_name in self.ignored_classes:
                continue

            percentage = (count / total_pixels) * 100
            if percentage < 0.5:  # Only include significant detections
                continue

            class_mask = pred == class_id
            avg_conf = confidences[class_mask].mean() if class_mask.any() else 0

            detections.append({
                'class_id': int(class_id),
                'class_name': class_name,
                'percentage': float(percentage),
                'confidence': float(avg_conf),
                'pixel_count': int(count)
            })

        return detections

    def draw_class_labels(self, frame, pred, confidences):
        """Draw detected class labels on frame"""
        if not self.show_labels:
            return frame

        h, w = pred.shape
        unique_classes, counts = np.unique(pred, return_counts=True)
        sorted_indices = np.argsort(counts)[::-1]
        unique_classes = unique_classes[sorted_indices]
        counts = counts[sorted_indices]
        total_pixels = h * w

        legend_items = []
        for class_id, count in zip(unique_classes, counts):
            if class_id == 0:
                continue

            percentage = (count / total_pixels) * 100
            if percentage < 0.5:
                continue

            class_mask = pred == class_id
            avg_conf = confidences[class_mask].mean() if class_mask.any() else 0

            legend_items.append({
                'class_id': class_id,
                'name': self.class_names[class_id],
                'percentage': percentage,
                'confidence': avg_conf,
                'color': self.colors[class_id]
            })

            # Track new detections at this position
            if self.pos != self.last_pos:
                self.last_det.clear()
                self.last_pos = self.pos.copy()

            if legend_items[-1]['name'] not in self.last_det:
                self.last_det.append(legend_items[-1]['name'])
                print(f"Detected: {legend_items[-1]['name']}")

            if len(legend_items) >= 8:
                break

        # Draw legend
        if legend_items:
            legend_width = 280
            legend_x = frame.shape[1] - legend_width - 10
            legend_y_start = 10
            line_height = 30

            overlay = frame.copy()
            legend_height = len(legend_items) * line_height + 20
            cv2.rectangle(overlay,
                         (legend_x - 5, legend_y_start - 5),
                         (frame.shape[1] - 5, legend_y_start + legend_height),
                         (0, 0, 0), -1)
            frame = cv2.addWeighted(frame, 0.6, overlay, 0.4, 0)

            for i, item in enumerate(legend_items):
                y = legend_y_start + i * line_height + 20

                color_bgr = (int(item['color'][2]), int(item['color'][1]), int(item['color'][0]))
                cv2.rectangle(frame, (legend_x, y - 15), (legend_x + 20, y), color_bgr, -1)
                cv2.rectangle(frame, (legend_x, y - 15), (legend_x + 20, y), (255, 255, 255), 1)

                text = f"{item['name']}"
                cv2.putText(frame, text, (legend_x + 25, y - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

                stats = f"{item['percentage']:.1f}% ({item['confidence']:.2f})"
                cv2.putText(frame, stats, (legend_x + 25, y + 8),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 200, 200), 1)

        return frame

    def draw_gps_info(self, frame):
        """Draw GPS and Firebase info on frame"""
        if not (self.enable_gps or self.enable_firebase) or not self.show_gps_info:
            return frame

        info_height = 140
        info_width = 500
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, frame.shape[0] - info_height),
                     (info_width, frame.shape[0]), (0, 0, 0), -1)
        frame = cv2.addWeighted(frame, 0.7, overlay, 0.3, 0)

        y_offset = frame.shape[0] - info_height + 25

        # GPS info
        if self.enable_gps and self.current_location:
            lat = self.current_location.get('latitude', 0)
            lon = self.current_location.get('longitude', 0)
            city = self.current_location.get('city', 'Unknown')

            cv2.putText(frame, f"GPS: {lat:.6f}, {lon:.6f}", (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 255, 100), 1)
            y_offset += 20
            cv2.putText(frame, f"Location: {city}", (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 255, 100), 1)
            y_offset += 25

        # Firebase stats
        if self.enable_firebase:
            stats = self.firebase_uploader.get_statistics()
            cv2.putText(frame, f"Uploads: {stats['total_uploads']} | " +
                       f"Detections: {stats['total_detections']}", (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 200, 255), 1)
            y_offset += 20
            cv2.putText(frame, f"Batch: {stats['current_batch_size']}/5 | " +
                       f"Blocked: T={stats['uploads_prevented_time']}, D={stats['uploads_prevented_distance']}",
                       (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 255), 1)

        return frame

    def draw_info(self, frame, fps, inference_time):
        """Draw performance info on frame"""
        info_height = 120
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (450, info_height), (0, 0, 0), -1)
        frame_with_info = cv2.addWeighted(frame, 0.7, overlay, 0.3, 0)

        y_offset = 25
        cv2.putText(frame_with_info, f"FPS: {fps:.1f}", (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        y_offset += 25
        cv2.putText(frame_with_info, f"Inference: {inference_time*1000:.1f}ms", (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        y_offset += 25
        cv2.putText(frame_with_info, f"Confidence: {self.confidence_threshold:.2f}", (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        y_offset += 20
        cv2.putText(frame_with_info, "Controls: 'o'=overlay | 's'=split | 'l'=labels | 'g'=gps", (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        y_offset += 18
        cv2.putText(frame_with_info, "'+'/'-'=confidence | 'u'=force upload | 'q'=quit", (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        return frame_with_info

    def run(self, camera_id=0, display_width=1280, display_height=720):
        """Run real-time segmentation on webcam feed"""
        print(f"\nAttempting to open camera {camera_id}...")

        cap = cv2.VideoCapture(camera_id, cv2.CAP_DSHOW)
        if not cap.isOpened():
            print(f"Error: Could not open camera {camera_id} with DirectShow")
            print("Trying default backend...")
            cap = cv2.VideoCapture(camera_id)

        if not cap.isOpened():
            print(f"Error: Could not open camera {camera_id}")
            return

        print("Camera opened successfully!")
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, display_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, display_height)

        ret, test_frame = cap.read()
        if not ret:
            print("Error: Could not read from camera")
            cap.release()
            return
        print(f"Camera working! Resolution: {test_frame.shape[1]}x{test_frame.shape[0]}")

        print("\nStarting webcam segmentation...")
        print("Controls:")
        print("  'o' - Toggle overlay on/off")
        print("  's' - Toggle split view")
        print("  'l' - Toggle class labels")
        print("  'g' - Toggle GPS info display")
        print("  'u' - Force upload current batch to Firebase")
        print("  '+/-' - Adjust confidence threshold")
        print("  'q' - Quit")

        window_name = 'Semantic Segmentation'
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

        def on_confidence_change(value):
            self.confidence_threshold = value / 100.0

        cv2.createTrackbar('Confidence', window_name,
                          int(self.confidence_threshold * 100), 100,
                          on_confidence_change)

        # Get initial location
        if self.enable_gps:
            print("\nGetting initial GPS location...")
            self.current_location = self.location_tracker.get_location()
            if self.current_location:
                print(f"Location: {self.current_location['city']}, {self.current_location['country']}")
                print(f"Coordinates: {self.current_location['latitude']:.6f}, {self.current_location['longitude']:.6f}")
                self.pos = [self.current_location['latitude'], self.current_location['longitude']]
                self.last_pos = self.pos.copy()

        with torch.no_grad():
            frame_count = 0

            while True:
                start_time = time.time()

                ret, frame = cap.read()
                if not ret:
                    print("Error: Could not read frame")
                    break

                # Update GPS periodically (every 30 frames = ~1 second at 30fps)
                if self.enable_gps and frame_count % 30 == 0:
                    self.current_location = self.location_tracker.get_location()
                    if self.current_location:
                        self.pos = [self.current_location['latitude'],
                                   self.current_location['longitude']]

                # Preprocess
                input_batch, frame_resized = self.preprocess_frame(frame)

                # Run inference
                inference_start = time.time()
                output = self.model(input_batch)
                inference_time = time.time() - inference_start

                # Postprocess
                colored_mask, pred, confidences = self.postprocess_output(output, frame.shape)

                # Handle Firebase uploads (sample at specified rate to avoid redundancy)
                if self.enable_firebase and frame_count % self.detection_sample_rate == 0:
                    detection_data = self.extract_detection_data(pred, confidences)
                    if detection_data and self.current_location:
                        uploaded, reason = self.firebase_uploader.add_detection(
                            detection_data, self.current_location
                        )
                        # Uncomment for debugging:
                        # print(f"Frame {frame_count}: {reason}")

                # Create visualization
                if self.show_original:
                    h, w = frame.shape[:2]
                    split_frame = np.zeros((h, w, 3), dtype=np.uint8)
                    split_frame[:, :w//2] = frame[:, :w//2]

                    if self.show_overlay:
                        overlay = self.create_overlay(frame, colored_mask)
                        split_frame[:, w//2:] = overlay[:, w//2:]
                    else:
                        split_frame[:, w//2:] = colored_mask[:, w//2:]

                    cv2.line(split_frame, (w//2, 0), (w//2, h), (255, 255, 255), 2)
                    display_frame = split_frame
                else:
                    if self.show_overlay:
                        display_frame = self.create_overlay(frame, colored_mask)
                    else:
                        display_frame = colored_mask

                # Add overlays
                display_frame = self.draw_class_labels(display_frame, pred, confidences)
                display_frame = self.draw_gps_info(display_frame)

                # Calculate FPS
                frame_time = time.time() - start_time
                self.frame_times.append(frame_time)
                fps = 1.0 / (sum(self.frame_times) / len(self.frame_times))

                # Draw info
                display_frame = self.draw_info(display_frame, fps, inference_time)

                # Display
                cv2.imshow(window_name, display_frame)

                # Handle keyboard input
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('o'):
                    self.show_overlay = not self.show_overlay
                    print(f"Overlay: {'ON' if self.show_overlay else 'OFF'}")
                elif key == ord('s'):
                    self.show_original = not self.show_original
                    print(f"Split view: {'ON' if self.show_original else 'OFF'}")
                elif key == ord('l'):
                    self.show_labels = not self.show_labels
                    print(f"Labels: {'ON' if self.show_labels else 'OFF'}")
                elif key == ord('g'):
                    self.show_gps_info = not self.show_gps_info
                    print(f"GPS info: {'ON' if self.show_gps_info else 'OFF'}")
                elif key == ord('u'):
                    if self.enable_firebase:
                        print("Forcing Firebase upload...")
                        self.firebase_uploader.upload_batch()
                elif key in [ord('+'), ord('=')]:
                    self.confidence_threshold = min(1.0, self.confidence_threshold + 0.05)
                    cv2.setTrackbarPos('Confidence', window_name, int(self.confidence_threshold * 100))
                    print(f"Confidence threshold: {self.confidence_threshold:.2f}")
                elif key in [ord('-'), ord('_')]:
                    self.confidence_threshold = max(0.0, self.confidence_threshold - 0.05)
                    cv2.setTrackbarPos('Confidence', window_name, int(self.confidence_threshold * 100))
                    print(f"Confidence threshold: {self.confidence_threshold:.2f}")

                frame_count += 1

        # Final upload of remaining batch
        if self.enable_firebase and self.firebase_uploader.detection_batch:
            print("\nUploading final batch...")
            self.firebase_uploader.upload_batch()

        # Print final statistics
        if self.enable_firebase:
            print("\n" + "="*50)
            print("FIREBASE UPLOAD STATISTICS")
            print("="*50)
            stats = self.firebase_uploader.get_statistics()
            for key, value in stats.items():
                print(f"{key}: {value}")

        # Cleanup
        cap.release()
        cv2.destroyAllWindows()
        print("\nSession complete")
        print(f"Average FPS: {fps:.1f}")
        print(f"Average inference time: {np.mean(self.frame_times)*1000:.1f}ms")


def main():
    parser = argparse.ArgumentParser(description='Real-time semantic segmentation with GPS and Firebase')
    parser.add_argument('--model', type=str,
                        default="C:/Users/Cmull/PycharmProjects/CurbyCam/best_model.pth",
                        help='Path to trained model checkpoint')
    parser.add_argument('--camera', type=int, default=0,
                        help='Camera device ID (default: 0)')
    parser.add_argument('--device', type=str, default='cuda',
                        choices=['cuda', 'cpu'],
                        help='Device to run inference on')
    parser.add_argument('--width', type=int, default=1280,
                        help='Display width (default: 1280)')
    parser.add_argument('--height', type=int, default=720,
                        help='Display height (default: 720)')

    # GPS and Firebase options
    parser.add_argument('--enable-gps', action='store_true',
                        help='Enable GPS location tracking')
    parser.add_argument('--enable-firebase', action='store_true',
                        help='Enable Firebase uploads')
    parser.add_argument('--firebase-config', type=str,
                        help='Path to Firebase credentials JSON file')
    parser.add_argument('--upload-interval', type=int, default=60,
                        help='Minimum seconds between uploads (default: 60)')
    parser.add_argument('--min-distance', type=int, default=10,
                        help='Minimum distance in meters to trigger upload (default: 10)')
    parser.add_argument('--detection-sample-rate', type=int, default=5,
                        help='Capture detections every N frames (default: 5, range: 1-30)')
    parser.add_argument('--ignore-classes', type=str, nargs='*',
                        help='Additional class names to ignore (e.g., "Car" "Person")')
    parser.add_argument('--only-classes', type=str, nargs='*',
                        help='Only capture these classes (e.g., "Pothole" "Curb" "Sidewalk")')
    parser.add_argument('--api-url', type=str, default=None,
                        help='Base URL for .NET API (e.g. "http://localhost:5049"). '
                             'When set, detections upload via the API instead of direct Firestore.')
    parser.add_argument('--source-device-id', type=str, default='camera_segmentation',
                        help='Device identifier sent with each detection (default: camera_segmentation)')

    args = parser.parse_args()

    # Validate upload config - need either API URL or Firebase config
    if args.enable_firebase and not args.firebase_config and not args.api_url:
        print("Warning: --enable-firebase requires --firebase-config or --api-url")
        print("Detection uploads will be disabled")
        args.enable_firebase = False

    # Initialize and run
    webcam_seg = WebcamSegmentation(
        model_path=args.model,
        device=args.device,
        enable_gps=args.enable_gps,
        enable_firebase=args.enable_firebase,
        firebase_config=args.firebase_config,
        upload_interval=args.upload_interval,
        min_distance=args.min_distance,
        detection_sample_rate=args.detection_sample_rate,
        api_base_url=args.api_url,
        source_device_id=args.source_device_id
    )

    # Apply custom class filters if provided
    if args.ignore_classes:
        webcam_seg.ignored_classes.update(args.ignore_classes)
        print(f"Added {len(args.ignore_classes)} classes to ignore list")

    if args.only_classes:
        # If only-classes is specified, ignore everything except these
        all_classes = set(webcam_seg.class_names)
        webcam_seg.ignored_classes = all_classes - set(args.only_classes)
        print(f"Only capturing: {', '.join(args.only_classes)}")

    webcam_seg.run(
        camera_id=args.camera,
        display_width=args.width,
        display_height=args.height
    )


if __name__ == '__main__':
    main()