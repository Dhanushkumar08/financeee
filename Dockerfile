# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Create the instance directory if it doesn't exist (for SQLite)
RUN mkdir -p instance

# Make port 10000 available (Render's default, but $PORT will override)
EXPOSE 10000

# Run the application using gunicorn for production stability
# We use the shell form to allow environment variable expansion for $PORT
CMD gunicorn --bind 0.0.0.0:${PORT:-10000} app:app
