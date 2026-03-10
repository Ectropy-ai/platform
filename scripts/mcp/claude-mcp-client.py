"""
Claude MCP Client Integration Example
Demonstrates how AI agents can integrate with the Ectropy MCP Server
"""

import requests
import os
import json
import time
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class MCPResponse:
    """Structured response from MCP API"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


class MCPClient:
    """
    Python client for interacting with Ectropy MCP Server
    Designed for AI agent integration (Claude, GPT, etc.)
    """
    
    def __init__(self, endpoint: str, token: str, timeout: int = 30):
        """
        Initialize MCP client
        
        Args:
            endpoint: MCP server endpoint (e.g., 'https://api.ectropy.com/mcp')
            token: Agent authentication token
            timeout: Request timeout in seconds
        """
        self.endpoint = endpoint.rstrip('/')
        self.token = token
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': 'Claude-MCP-Client/1.0'
        })
    
    def _make_request(self, method: str, url: str, **kwargs) -> MCPResponse:
        """Make HTTP request with error handling and timing"""
        start_time = time.time()
        
        try:
            response = self.session.request(
                method=method,
                url=f"{self.endpoint}{url}",
                timeout=self.timeout,
                **kwargs
            )
            
            execution_time = time.time() - start_time
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    return MCPResponse(
                        success=True,
                        data=data,
                        execution_time=execution_time
                    )
                except json.JSONDecodeError:
                    return MCPResponse(
                        success=False,
                        error="Invalid JSON response",
                        execution_time=execution_time
                    )
            else:
                return MCPResponse(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    execution_time=execution_time
                )
                
        except requests.exceptions.Timeout:
            return MCPResponse(
                success=False,
                error=f"Request timeout after {self.timeout}s"
            )
        except requests.exceptions.RequestException as e:
            return MCPResponse(
                success=False,
                error=f"Request error: {str(e)}"
            )
    
    def semantic_search(self, query: str, limit: int = 10, 
                       filters: Optional[Dict] = None, 
                       threshold: float = 0.7) -> MCPResponse:
        """
        Perform semantic search across indexed documents
        
        Args:
            query: Search query text
            limit: Maximum number of results
            filters: Optional filters for search
            threshold: Similarity threshold (0.0-1.0)
            
        Returns:
            MCPResponse with search results
        """
        payload = {
            'tool': 'semantic_search',
            'parameters': {
                'query': query,
                'limit': limit,
                'threshold': threshold
            }
        }
        
        if filters:
            payload['parameters']['filters'] = filters
            
        return self._make_request('POST', '/api/tools/call', json=payload)
    
    def analyze_document(self, document_path: str, 
                        analysis_type: str = 'summary') -> MCPResponse:
        """
        Analyze a document for insights
        
        Args:
            document_path: Path to document in the system
            analysis_type: Type of analysis ('summary', 'keywords', 'structure')
            
        Returns:
            MCPResponse with analysis results
        """
        payload = {
            'tool': 'document_analysis',
            'parameters': {
                'document_path': document_path,
                'analysis_type': analysis_type
            }
        }
        
        return self._make_request('POST', '/api/tools/call', json=payload)
    
    def generate_code(self, specification: str, language: str = 'typescript',
                     framework: Optional[str] = None) -> MCPResponse:
        """
        Generate code based on specifications
        
        Args:
            specification: Description of what to generate
            language: Programming language
            framework: Optional framework context
            
        Returns:
            MCPResponse with generated code
        """
        payload = {
            'tool': 'code_generation',
            'parameters': {
                'specification': specification,
                'language': language
            }
        }
        
        if framework:
            payload['parameters']['framework'] = framework
            
        return self._make_request('POST', '/api/tools/call', json=payload)
    
    def get_health_metrics(self) -> MCPResponse:
        """
        Get system health and performance metrics
        
        Returns:
            MCPResponse with health metrics
        """
        payload = {
            'tool': 'health_metrics',
            'parameters': {}
        }
        
        return self._make_request('POST', '/api/tools/call', json=payload)
    
    def get_context(self, query: str, context_size: int = 5) -> str:
        """
        Get relevant context for a query (convenience method for AI agents)
        
        Args:
            query: Query to find context for
            context_size: Number of context snippets to retrieve
            
        Returns:
            Formatted context string
        """
        response = self.semantic_search(query, limit=context_size)
        
        if not response.success:
            return f"Context retrieval failed: {response.error}"
        
        if not response.data or 'results' not in response.data:
            return "No relevant context found."
        
        context_parts = []
        for result in response.data['results']:
            file_path = result.get('metadata', {}).get('file_path', 'Unknown')
            content = result.get('content', '')[:500]  # Limit content length
            score = result.get('score', 0)
            
            context_parts.append(
                f"File: {file_path} (Score: {score:.2f})\n{content}..."
            )
        
        return "\n\n".join(context_parts)
    
    def health_check(self) -> MCPResponse:
        """Simple health check"""
        return self._make_request('GET', '/health')


class ClaudeContextManager:
    """
    Context manager specifically designed for Claude integration
    Handles context retrieval and management for construction projects
    """
    
    def __init__(self, mcp_client: MCPClient):
        self.mcp = mcp_client
        self.context_cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    def get_construction_context(self, query: str) -> Dict[str, Any]:
        """
        Get construction-specific context with domain expertise
        
        Args:
            query: Construction-related query
            
        Returns:
            Structured context for construction domain
        """
        # Check cache first
        cache_key = f"construction:{hash(query)}"
        if self._is_cached(cache_key):
            return self.context_cache[cache_key]['data']
        
        # Get semantic search results
        search_response = self.mcp.semantic_search(
            query=query,
            limit=10,
            filters={'category': 'construction', 'domain': 'technical'}
        )
        
        if not search_response.success:
            return {
                'error': f"Context retrieval failed: {search_response.error}",
                'context': []
            }
        
        results = search_response.data.get('results', [])
        
        # Categorize results by type
        context = {
            'specifications': [],
            'procedures': [],
            'materials': [],
            'safety': [],
            'general': []
        }
        
        for result in results:
            content_type = self._classify_construction_content(result)
            context[content_type].append({
                'content': result.get('content', ''),
                'source': result.get('metadata', {}).get('file_path', ''),
                'score': result.get('score', 0),
                'summary': result.get('content', '')[:200] + '...'
            })
        
        # Cache the result
        self.context_cache[cache_key] = {
            'data': context,
            'timestamp': time.time()
        }
        
        return context
    
    def _classify_construction_content(self, result: Dict) -> str:
        """Classify construction content by type"""
        content = result.get('content', '').lower()
        
        if any(keyword in content for keyword in ['specification', 'standard', 'code', 'requirement']):
            return 'specifications'
        elif any(keyword in content for keyword in ['procedure', 'process', 'workflow', 'step']):
            return 'procedures'
        elif any(keyword in content for keyword in ['material', 'concrete', 'steel', 'wood', 'component']):
            return 'materials'
        elif any(keyword in content for keyword in ['safety', 'hazard', 'risk', 'protection']):
            return 'safety'
        else:
            return 'general'
    
    def _is_cached(self, key: str) -> bool:
        """Check if context is cached and still valid"""
        if key not in self.context_cache:
            return False
        
        age = time.time() - self.context_cache[key]['timestamp']
        return age < self.cache_ttl
    
    def get_bim_context(self, query: str) -> Dict[str, Any]:
        """Get BIM/IFC specific context"""
        search_response = self.mcp.semantic_search(
            query=f"BIM IFC {query}",
            limit=5,
            filters={'category': 'bim', 'format': 'ifc'}
        )
        
        if search_response.success and search_response.data:
            return {
                'bim_context': search_response.data.get('results', []),
                'ifc_relevant': True
            }
        
        return {'bim_context': [], 'ifc_relevant': False}


def create_claude_client() -> MCPClient:
    """
    Factory function to create Claude-optimized MCP client
    """
    endpoint = os.getenv('MCP_ENDPOINT', 'http://localhost:3001')
    token = os.getenv('MCP_AGENT_TOKEN')
    
    if not token:
        raise ValueError("MCP_AGENT_TOKEN environment variable is required")
    
    return MCPClient(endpoint=endpoint, token=token)


# Example usage for Claude
def main():
    """Example usage of the MCP client"""
    try:
        # Initialize client
        mcp = create_claude_client()
        context_mgr = ClaudeContextManager(mcp)
        
        print("🤖 Claude MCP Integration Example")
        print("=" * 50)
        
        # Health check
        print("\n🏥 Health Check:")
        health = mcp.health_check()
        if health.success:
            print(f"✅ MCP server healthy: {health.data.get('status', 'unknown')}")
        else:
            print(f"❌ Health check failed: {health.error}")
            return
        
        # Example 1: Get context for a construction question
        print("\n🏗️ Construction Context Example:")
        query = "How does authentication work in the construction platform?"
        context = context_mgr.get_construction_context(query)
        
        print(f"Query: {query}")
        print(f"Specifications found: {len(context.get('specifications', []))}")
        print(f"Procedures found: {len(context.get('procedures', []))}")
        
        # Example 2: Semantic search
        print("\n🔍 Semantic Search Example:")
        search_result = mcp.semantic_search("authentication middleware security")
        if search_result.success:
            results = search_result.data.get('results', [])
            print(f"Found {len(results)} relevant documents")
            for i, result in enumerate(results[:3]):
                print(f"  {i+1}. {result.get('metadata', {}).get('file_path', 'Unknown')} "
                      f"(Score: {result.get('score', 0):.2f})")
        
        # Example 3: Document analysis
        print("\n📄 Document Analysis Example:")
        analysis = mcp.analyze_document("README.md", "summary")
        if analysis.success:
            print("✅ Document analysis completed")
            print(f"Execution time: {analysis.execution_time:.2f}s")
        else:
            print(f"❌ Analysis failed: {analysis.error}")
        
        # Example 4: Get formatted context (for prompt injection)
        print("\n📝 Context for Claude:")
        formatted_context = mcp.get_context("user authentication JWT tokens")
        print("Context snippet:")
        print(formatted_context[:300] + "..." if len(formatted_context) > 300 else formatted_context)
        
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()