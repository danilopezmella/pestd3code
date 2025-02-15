from setuptools import setup, find_packages

setup(
    name="n8n-backend",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "fastapi==0.109.2",
        "uvicorn==0.27.1",
        "psycopg2-binary==2.9.9",
        "python-dotenv==1.0.1",
        "pydantic==2.10.6",
        "pydantic-ai==0.0.21",
        "supabase==2.12.0"
    ],
    python_requires=">=3.8",
) 